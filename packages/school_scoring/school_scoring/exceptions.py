class SchoolScoringError(Exception):
    """Base exception for the scoring package."""


class SchemaValidationError(SchoolScoringError):
    """Raised when input data does not match the required schema."""


class WeightValidationError(SchoolScoringError):
    """Raised when weights are malformed or inconsistent."""


class ConfigurationError(SchoolScoringError):
    """Raised when the scoring configuration is invalid."""

