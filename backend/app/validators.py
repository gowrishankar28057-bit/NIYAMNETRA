"""Server-side validation for the simplified demo application forms.

These forms are a demonstration subset; they are not the complete statutory AICTE forms.
"""

from datetime import date

from . import catalog

LEVELS = {"Diploma", "UG", "PG", "PhD"}
LAB_OPTIONS = {"available", "partially_available", "to_be_established"}

FIELD_SPECS = {
    "intake": {
        "programme_name": ("text", True, 3, 120),
        "department": ("text", True, 2, 120),
        "programme_level": ("choice", True, LEVELS),
        "current_intake": ("int", True, 1, 1000),
        "proposed_intake": ("int", True, 1, 1500),
        "classroom_capacity": ("int", True, 1, 5000),
        "lab_availability": ("choice", True, LAB_OPTIONS),
        "faculty_strength": ("int", True, 1, 2000),
        "justification": ("text", True, 30, 2000),
        "remarks": ("text", False, 0, 1000),
    },
    "new_course": {
        "programme_name": ("text", True, 3, 120),
        "specialization": ("text", True, 2, 120),
        "programme_level": ("choice", True, LEVELS),
        "department": ("text", True, 2, 120),
        "proposed_intake": ("int", True, 1, 600),
        "affiliation_details": ("text", True, 10, 500),
        "faculty_strength": ("int", True, 1, 500),
        "lab_infrastructure": ("text", True, 20, 2000),
        "justification": ("text", True, 30, 2000),
        "objectives": ("text", True, 30, 2000),
    },
    "other": {
        "request_category": ("choice", True, catalog.OTHER_CATEGORY_CODES),
        "description": ("text", True, 30, 2000),
        "reference_identifiers": ("text", False, 0, 200),
        "effective_date": ("date", False),
        "justification": ("text", True, 30, 2000),
    },
}

OTHER_CONTEXT = {
    "institution_details": {
        "detail_field": ("text", True, 3, 80),
        "current_value": ("text", True, 2, 300),
        "proposed_value": ("text", True, 2, 300),
    },
    "change_location": {
        "current_address": ("text", True, 10, 300),
        "proposed_address": ("text", True, 10, 300),
        "land_area_sqm": ("int", True, 100, 10_000_000),
    },
    "change_name": {
        "current_name": ("text", True, 5, 200),
        "proposed_name": ("text", True, 5, 200),
    },
    "course_closure": {
        "programme_name": ("text", True, 3, 120),
        "closure_action": ("choice", True, {"closure", "modification"}),
        "current_intake": ("int", True, 1, 1000),
        "students_enrolled": ("int", True, 0, 5000),
    },
    "other_request": {
        "subject": ("text", True, 5, 160),
    },
}


def _check(name, spec, value, errors, cleaned, partial):
    kind, required = spec[0], spec[1]
    empty = value is None or (isinstance(value, str) and not value.strip())
    if empty:
        if required and not partial:
            errors[name] = "This field is required."
        return
    if kind == "text":
        text = str(value).strip()
        lo, hi = spec[2], spec[3]
        if len(text) > hi:
            errors[name] = f"Must be at most {hi} characters."
        elif len(text) < lo and not partial:
            errors[name] = f"Must be at least {lo} characters."
        cleaned[name] = text
    elif kind == "int":
        raw = str(value).strip()
        if isinstance(value, bool) or not raw.isdigit():
            errors[name] = "Enter a whole number."
            return
        num = int(raw)
        lo, hi = spec[2], spec[3]
        if num < lo or num > hi:
            errors[name] = f"Must be between {lo} and {hi}."
        cleaned[name] = num
    elif kind == "choice":
        if value not in spec[2]:
            errors[name] = "Select a valid option."
        else:
            cleaned[name] = value
    elif kind == "date":
        try:
            parsed = date.fromisoformat(str(value))
        except ValueError:
            errors[name] = "Enter a valid date."
            return
        if parsed < date.today():
            errors[name] = "Effective date cannot be in the past."
        cleaned[name] = parsed.isoformat()


def known_fields(app_type, data):
    if app_type == "eoa":
        return set()
    names = set(FIELD_SPECS[app_type])
    if app_type == "other":
        names |= set(OTHER_CONTEXT.get((data or {}).get("request_category"), {}))
    return names


def validate_form(app_type, data, partial=False):
    """Return (cleaned, errors). Partial mode allows saving incomplete drafts."""
    data = data or {}
    errors, cleaned = {}, {}
    if app_type == "eoa":
        return {}, {}
    specs = dict(FIELD_SPECS[app_type])
    if app_type == "other":
        category = data.get("request_category")
        specs.update(OTHER_CONTEXT.get(category, {}))
    for name, spec in specs.items():
        _check(name, spec, data.get(name), errors, cleaned, partial)
    if app_type == "intake":
        cur, prop = cleaned.get("current_intake"), cleaned.get("proposed_intake")
        if isinstance(cur, int) and isinstance(prop, int):
            if prop <= cur and "proposed_intake" not in errors:
                errors["proposed_intake"] = "Proposed intake must exceed the currently approved intake."
            elif prop > cur * 3 and "proposed_intake" not in errors:
                errors["proposed_intake"] = "Proposed intake cannot exceed three times the current intake."
            cleaned["additional_seats"] = max(prop - cur, 0)
            cap = cleaned.get("classroom_capacity")
            if isinstance(cap, int) and cap < prop and "classroom_capacity" not in errors and not partial:
                errors["classroom_capacity"] = "Classroom capacity should accommodate the proposed intake."
    return cleaned, errors
