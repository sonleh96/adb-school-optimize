"""Version of the screening engine. Keep in step with ``version`` in the package pyproject.toml.

0.2.0: the revised paper's provenance and policy roles. A run stored by 0.1.0 names a provenance that no longer exists,
so the API refuses it as stale, and loading the input version again stores the 0.2.0 runs beside it.
"""

PACKAGE_VERSION = "0.2.0"
