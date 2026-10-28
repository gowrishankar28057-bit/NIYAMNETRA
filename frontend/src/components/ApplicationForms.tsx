import { Field } from "./ui";
import type { AppTypeCode } from "../lib/types";

export type FormValues = Record<string, string | number>;

const LEVELS = [["Diploma", "Diploma"], ["UG", "Under-Graduate (UG)"], ["PG", "Post-Graduate (PG)"], ["PhD", "Doctoral (PhD)"]];
const LABS = [["available", "Available"], ["partially_available", "Partially available"], ["to_be_established", "To be established"]];

interface Props {
  appType: AppTypeCode;
  values: FormValues;
  errors: Record<string, string>;
  onChange: (name: string, value: string | number) => void;
}

function Input({ id, name, values, errors, onChange, type = "text", placeholder }: {
  id: string; name: string; values: FormValues; errors: Record<string, string>; onChange: Props["onChange"]; type?: string; placeholder?: string;
}) {
  return (
    <input id={id} className="field-input" type={type} placeholder={placeholder}
      value={values[name] ?? ""} aria-invalid={!!errors[name]}
      onChange={(e) => onChange(name, type === "number" ? e.target.value.replace(/[^\d]/g, "") : e.target.value)} />
  );
}

function Area({ id, name, values, errors, onChange, placeholder }: {
  id: string; name: string; values: FormValues; errors: Record<string, string>; onChange: Props["onChange"]; placeholder?: string;
}) {
  return (
    <textarea id={id} className="field-input min-h-[88px] resize-y" placeholder={placeholder}
      value={values[name] ?? ""} aria-invalid={!!errors[name]} onChange={(e) => onChange(name, e.target.value)} />
  );
}

export function ApplicationForm(props: Props) {
  if (props.appType === "intake") return <IntakeForm {...props} />;
  if (props.appType === "new_course") return <NewCourseForm {...props} />;
  if (props.appType === "other") return <OtherForm {...props} />;
  return null;
}

function IntakeForm({ values, errors, onChange }: Props) {
  const cur = Number(values.current_intake) || 0;
  const prop = Number(values.proposed_intake) || 0;
  const additional = prop > cur ? prop - cur : 0;
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Existing Programme" required error={errors.programme_name}>{(id) => <Input id={id} name="programme_name" values={values} errors={errors} onChange={onChange} placeholder="e.g. B.Tech Computer Science & Engineering" />}</Field>
      <Field label="Department" required error={errors.department}>{(id) => <Input id={id} name="department" values={values} errors={errors} onChange={onChange} />}</Field>
      <Field label="Programme Level" required error={errors.programme_level}>{(id) => (
        <select id={id} className="field-input" value={values.programme_level ?? ""} onChange={(e) => onChange("programme_level", e.target.value)} aria-invalid={!!errors.programme_level}>
          <option value="">Select…</option>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>)}</Field>
      <Field label="Academic Year" error={errors.academic_year} hint="Set on the previous step">{(id) => <input id={id} className="field-input bg-navy-50" disabled value={String(values._academic_year ?? "")} />}</Field>
      <Field label="Currently Approved Intake" required error={errors.current_intake}>{(id) => <Input id={id} name="current_intake" type="number" values={values} errors={errors} onChange={onChange} placeholder="e.g. 120" />}</Field>
      <Field label="Proposed Intake" required error={errors.proposed_intake}>{(id) => <Input id={id} name="proposed_intake" type="number" values={values} errors={errors} onChange={onChange} placeholder="e.g. 180" />}</Field>
      <Field label="Additional Seats Requested" hint="Calculated automatically">{(id) => (
        <input id={id} className="field-input bg-teal-50 font-bold text-teal-800" disabled value={additional ? `${additional} seats` : "—"} />)}</Field>
      <Field label="Existing Classroom Capacity" required error={errors.classroom_capacity}>{(id) => <Input id={id} name="classroom_capacity" type="number" values={values} errors={errors} onChange={onChange} />}</Field>
      <Field label="Laboratory Availability" required error={errors.lab_availability}>{(id) => (
        <select id={id} className="field-input" value={values.lab_availability ?? ""} onChange={(e) => onChange("lab_availability", e.target.value)} aria-invalid={!!errors.lab_availability}>
          <option value="">Select…</option>{LABS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>)}</Field>
      <Field label="Current Faculty Strength" required error={errors.faculty_strength}>{(id) => <Input id={id} name="faculty_strength" type="number" values={values} errors={errors} onChange={onChange} />}</Field>
      <div className="sm:col-span-2"><Field label="Justification" required error={errors.justification} hint="Why the additional intake is needed (min 30 characters)">{(id) => <Area id={id} name="justification" values={values} errors={errors} onChange={onChange} />}</Field></div>
      <div className="sm:col-span-2"><Field label="Supporting Remarks" error={errors.remarks}>{(id) => <Area id={id} name="remarks" values={values} errors={errors} onChange={onChange} placeholder="Optional" />}</Field></div>
    </div>
  );
}

function NewCourseForm({ values, errors, onChange }: Props) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Proposed Programme Name" required error={errors.programme_name}>{(id) => <Input id={id} name="programme_name" values={values} errors={errors} onChange={onChange} placeholder="e.g. B.Tech Robotics & Automation" />}</Field>
      <Field label="Course Specialization" required error={errors.specialization}>{(id) => <Input id={id} name="specialization" values={values} errors={errors} onChange={onChange} />}</Field>
      <Field label="Programme Level" required error={errors.programme_level}>{(id) => (
        <select id={id} className="field-input" value={values.programme_level ?? ""} onChange={(e) => onChange("programme_level", e.target.value)} aria-invalid={!!errors.programme_level}>
          <option value="">Select…</option>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>)}</Field>
      <Field label="Department" required error={errors.department}>{(id) => <Input id={id} name="department" values={values} errors={errors} onChange={onChange} />}</Field>
      <Field label="Proposed Intake" required error={errors.proposed_intake}>{(id) => <Input id={id} name="proposed_intake" type="number" values={values} errors={errors} onChange={onChange} placeholder="e.g. 60" />}</Field>
      <Field label="Proposed Faculty Strength" required error={errors.faculty_strength}>{(id) => <Input id={id} name="faculty_strength" type="number" values={values} errors={errors} onChange={onChange} />}</Field>
      <div className="sm:col-span-2"><Field label="Affiliation Details" required error={errors.affiliation_details}>{(id) => <Input id={id} name="affiliation_details" values={values} errors={errors} onChange={onChange} placeholder="University consent / NOC reference" />}</Field></div>
      <div className="sm:col-span-2"><Field label="Laboratory & Infrastructure Details" required error={errors.lab_infrastructure}>{(id) => <Area id={id} name="lab_infrastructure" values={values} errors={errors} onChange={onChange} />}</Field></div>
      <div className="sm:col-span-2"><Field label="Course Justification" required error={errors.justification}>{(id) => <Area id={id} name="justification" values={values} errors={errors} onChange={onChange} />}</Field></div>
      <div className="sm:col-span-2"><Field label="Programme Objectives" required error={errors.objectives}>{(id) => <Area id={id} name="objectives" values={values} errors={errors} onChange={onChange} />}</Field></div>
    </div>
  );
}

const CATEGORIES = [
  ["institution_details", "Institution detail changes"],
  ["change_location", "Change of location"],
  ["change_name", "Change of institution name"],
  ["course_closure", "Course closure or modification"],
  ["other_request", "Other request"],
];

function OtherForm({ values, errors, onChange }: Props) {
  const cat = String(values.request_category || "");
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Request Category" required error={errors.request_category}>{(id) => (
          <select id={id} className="field-input" value={cat} onChange={(e) => onChange("request_category", e.target.value)} aria-invalid={!!errors.request_category}>
            <option value="">Select a request category…</option>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>)}</Field>
      </div>

      {cat === "institution_details" && <>
        <Field label="Detail to Change" required error={errors.detail_field}>{(id) => <Input id={id} name="detail_field" values={values} errors={errors} onChange={onChange} placeholder="e.g. Official e-mail" />}</Field>
        <div />
        <Field label="Current Value" required error={errors.current_value}>{(id) => <Input id={id} name="current_value" values={values} errors={errors} onChange={onChange} />}</Field>
        <Field label="Proposed Value" required error={errors.proposed_value}>{(id) => <Input id={id} name="proposed_value" values={values} errors={errors} onChange={onChange} />}</Field>
      </>}
      {cat === "change_location" && <>
        <div className="sm:col-span-2"><Field label="Current Address" required error={errors.current_address}>{(id) => <Area id={id} name="current_address" values={values} errors={errors} onChange={onChange} />}</Field></div>
        <div className="sm:col-span-2"><Field label="Proposed Address" required error={errors.proposed_address}>{(id) => <Area id={id} name="proposed_address" values={values} errors={errors} onChange={onChange} />}</Field></div>
        <Field label="Land Area at Proposed Site (sq.m)" required error={errors.land_area_sqm}>{(id) => <Input id={id} name="land_area_sqm" type="number" values={values} errors={errors} onChange={onChange} />}</Field>
      </>}
      {cat === "change_name" && <>
        <Field label="Current Institution Name" required error={errors.current_name}>{(id) => <Input id={id} name="current_name" values={values} errors={errors} onChange={onChange} />}</Field>
        <Field label="Proposed Institution Name" required error={errors.proposed_name}>{(id) => <Input id={id} name="proposed_name" values={values} errors={errors} onChange={onChange} />}</Field>
      </>}
      {cat === "course_closure" && <>
        <Field label="Programme Name" required error={errors.programme_name}>{(id) => <Input id={id} name="programme_name" values={values} errors={errors} onChange={onChange} />}</Field>
        <Field label="Action" required error={errors.closure_action}>{(id) => (
          <select id={id} className="field-input" value={values.closure_action ?? ""} onChange={(e) => onChange("closure_action", e.target.value)} aria-invalid={!!errors.closure_action}>
            <option value="">Select…</option><option value="closure">Closure</option><option value="modification">Modification</option>
          </select>)}</Field>
        <Field label="Current Intake" required error={errors.current_intake}>{(id) => <Input id={id} name="current_intake" type="number" values={values} errors={errors} onChange={onChange} />}</Field>
        <Field label="Students Currently Enrolled" required error={errors.students_enrolled}>{(id) => <Input id={id} name="students_enrolled" type="number" values={values} errors={errors} onChange={onChange} />}</Field>
      </>}
      {cat === "other_request" && (
        <div className="sm:col-span-2"><Field label="Subject" required error={errors.subject}>{(id) => <Input id={id} name="subject" values={values} errors={errors} onChange={onChange} />}</Field></div>
      )}

      {cat && <>
        <div className="sm:col-span-2"><Field label="Request Description" required error={errors.description} hint="Describe the change (min 30 characters)">{(id) => <Area id={id} name="description" values={values} errors={errors} onChange={onChange} />}</Field></div>
        <Field label="Relevant Identifiers" error={errors.reference_identifiers}>{(id) => <Input id={id} name="reference_identifiers" values={values} errors={errors} onChange={onChange} placeholder="Optional reference numbers" />}</Field>
        <Field label="Effective Date" error={errors.effective_date}>{(id) => <input id={id} type="date" className="field-input" value={values.effective_date ?? ""} onChange={(e) => onChange("effective_date", e.target.value)} />}</Field>
        <div className="sm:col-span-2"><Field label="Justification" required error={errors.justification}>{(id) => <Area id={id} name="justification" values={values} errors={errors} onChange={onChange} />}</Field></div>
      </>}
    </div>
  );
}
