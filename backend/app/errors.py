from flask import jsonify


class ApiError(Exception):
    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}

    def response(self):
        body = {"ok": False, "error": {"code": self.code, "message": self.message, "details": self.details}}
        return jsonify(body), self.status


def ok(data=None, status=200):
    return jsonify({"ok": True, "data": data}), status
