"""Tests for check_notebooks.py. All notebooks here are invented."""

import json
import os
import subprocess
import sys
import tempfile
import unittest

import check_notebooks

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "check_notebooks.py")
SECRET = "INVENTED-SCHOOL-NAME-12345"


def code_cell(**overrides):
    cell = {"cell_type": "code", "metadata": {}, "source": ["1 + 1"], "outputs": [], "execution_count": None}
    cell.update(overrides)
    return cell


def notebook(*cells):
    return json.dumps({"cells": list(cells), "metadata": {}, "nbformat": 4, "nbformat_minor": 5})


class CheckTextTest(unittest.TestCase):
    def test_clean_notebook_passes(self):
        md = {"cell_type": "markdown", "metadata": {}, "source": ["# Title"]}
        self.assertEqual(check_notebooks.check_text(notebook(md, code_cell())), [])

    def test_notebook_with_no_cells_passes(self):
        self.assertEqual(check_notebooks.check_text(notebook()), [])

    def test_non_empty_outputs_name_the_cell(self):
        out = {"output_type": "stream", "name": "stdout", "text": [SECRET]}
        problems = check_notebooks.check_text(notebook(code_cell(), code_cell(outputs=[out])))
        self.assertEqual(len(problems), 1)
        self.assertIn("cell 1", problems[0])
        self.assertIn("outputs", problems[0])

    def test_messages_never_echo_cell_content(self):
        out = {"output_type": "stream", "name": "stdout", "text": [SECRET]}
        cell = code_cell(outputs=[out], execution_count=3, source=[SECRET])
        self.assertNotIn(SECRET, "\n".join(check_notebooks.check_text(notebook(cell))))

    def test_unknown_cell_type_is_not_echoed(self):
        cell = code_cell(cell_type=SECRET, execution_count=1)
        problems = check_notebooks.check_text(notebook(cell))
        self.assertEqual(len(problems), 1)
        self.assertNotIn(SECRET, problems[0])

    def test_attachments_on_markdown_and_raw_cells_are_flagged(self):
        # A pasted screenshot of a table is stored as a cell attachment.
        for kind in ("markdown", "raw"):
            with self.subTest(kind=kind):
                cell = {
                    "cell_type": kind,
                    "metadata": {},
                    "source": [],
                    "attachments": {"t.png": {"image/png": SECRET}},
                }
                problems = check_notebooks.check_text(notebook(cell))
                self.assertEqual(len(problems), 1)
                self.assertIn("attachments", problems[0])

    def test_empty_attachments_pass(self):
        md = {"cell_type": "markdown", "metadata": {}, "source": [], "attachments": {}}
        self.assertEqual(check_notebooks.check_text(notebook(md)), [])

    def test_saved_widget_state_is_flagged(self):
        nb = json.loads(notebook(code_cell()))
        nb["metadata"]["widgets"] = {
            "application/vnd.jupyter.widget-state+json": {"state": {"m": {SECRET: 1}}}
        }
        problems = check_notebooks.check_text(json.dumps(nb))
        self.assertEqual(len(problems), 1)
        self.assertIn("widgets", problems[0])
        self.assertNotIn(SECRET, problems[0])

    def test_execution_count_zero_is_flagged(self):
        problems = check_notebooks.check_text(notebook(code_cell(execution_count=0)))
        self.assertEqual(len(problems), 1)
        self.assertIn("execution_count", problems[0])

    def test_outputs_on_a_markdown_cell_are_flagged(self):
        md = {"cell_type": "markdown", "metadata": {}, "source": [], "outputs": [{"output_type": "stream"}]}
        self.assertEqual(len(check_notebooks.check_text(notebook(md))), 1)

    def test_each_output_like_metadata_key_is_flagged(self):
        # Listed here, not read from the module, so dropping a key fails the test.
        for key in ("collapsed", "scrolled", "ExecuteTime", "execution", "outputExpanded", "outputs"):
            with self.subTest(key=key):
                problems = check_notebooks.check_text(notebook(code_cell(metadata={key: True})))
                self.assertEqual(len(problems), 1)
                self.assertIn(key, problems[0])

    def test_jupyter_outputs_hidden_is_flagged_but_source_hidden_is_not(self):
        hidden = code_cell(metadata={"jupyter": {"outputs_hidden": True}})
        self.assertEqual(len(check_notebooks.check_text(notebook(hidden))), 1)
        source_only = code_cell(metadata={"jupyter": {"source_hidden": True}, "tags": ["keep"]})
        self.assertEqual(check_notebooks.check_text(notebook(source_only)), [])

    def test_output_like_metadata_on_a_markdown_cell_is_ignored(self):
        md = {"cell_type": "markdown", "metadata": {"collapsed": True}, "source": []}
        self.assertEqual(check_notebooks.check_text(notebook(md)), [])

    def test_every_problem_in_a_notebook_is_reported(self):
        cells = [code_cell(execution_count=1), code_cell(metadata={"scrolled": True})]
        self.assertEqual(len(check_notebooks.check_text(notebook(*cells))), 2)

    def test_invalid_json_fails(self):
        problems = check_notebooks.check_text('{"cells": [')
        self.assertEqual(len(problems), 1)
        self.assertIn("JSON", problems[0])

    def test_unsupported_shapes_fail_instead_of_passing_silently(self):
        for text in ("[]", '"x"', "{}", '{"nbformat": 3, "worksheets": [{"cells": []}]}', '{"cells": {}}'):
            with self.subTest(text=text):
                self.assertEqual(len(check_notebooks.check_text(text)), 1)

    def test_cell_that_is_not_an_object_fails(self):
        self.assertEqual(len(check_notebooks.check_text('{"cells": [1]}')), 1)


class CheckFileTest(unittest.TestCase):
    def test_invalid_utf8_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "bad.ipynb")
            with open(path, "wb") as handle:
                handle.write(b"\xff\xfe\x00")
            self.assertEqual(check_notebooks.check_file(path), ["cannot read as UTF-8"])

    def test_missing_file_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(len(check_notebooks.check_file(os.path.join(tmp, "gone.ipynb"))), 1)


def run_script(cwd, *args):
    return subprocess.run([sys.executable, SCRIPT, *args], cwd=cwd, capture_output=True, text=True)


def git(cwd, *args):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


class TrackedFilesTest(unittest.TestCase):
    """The command-line path CI uses: no arguments, files come from git."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = self._tmp.name
        git(self.repo, "init", "-q")

    def tearDown(self):
        self._tmp.cleanup()

    def add(self, name, text, track=True):
        path = os.path.join(self.repo, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)
        if track:
            git(self.repo, "add", name)

    def test_dirty_tracked_notebook_exits_1_and_names_file_and_cell(self):
        self.add("a/clean.ipynb", notebook(code_cell()))
        self.add("a/my notebook.ipynb", notebook(code_cell(), code_cell(execution_count=2)))
        result = run_script(self.repo)
        self.assertEqual(result.returncode, 1)
        self.assertIn("a/my notebook.ipynb: cell 1 (code)", result.stdout)
        self.assertNotIn("clean.ipynb:", result.stdout)

    def test_clean_tracked_notebooks_exit_0(self):
        self.add("clean.ipynb", notebook(code_cell()))
        self.assertEqual(run_script(self.repo).returncode, 0)

    def test_upper_and_mixed_case_extensions_are_checked(self):
        self.add("UPPER.IPYNB", notebook(code_cell(execution_count=1)))
        self.add("sub/Mixed.Ipynb", notebook(code_cell(execution_count=1)))
        result = run_script(self.repo)
        self.assertEqual(result.returncode, 1)
        self.assertIn("UPPER.IPYNB: cell 0", result.stdout)
        self.assertIn("sub/Mixed.Ipynb: cell 0", result.stdout)

    def test_force_added_notebook_in_an_ignored_folder_is_checked(self):
        self.add(".gitignore", "notebooks/\n")
        self.add("notebooks/n.ipynb", notebook(code_cell(execution_count=1)), track=False)
        git(self.repo, "add", "-f", "notebooks/n.ipynb")
        self.assertEqual(run_script(self.repo).returncode, 1)

    def test_untracked_dirty_notebook_is_not_checked(self):
        self.add("scratch.ipynb", notebook(code_cell(execution_count=1)), track=False)
        self.assertEqual(run_script(self.repo).returncode, 0)

    def test_repo_with_no_notebooks_exits_0(self):
        self.assertEqual(run_script(self.repo).returncode, 0)

    def test_outside_a_git_repo_exits_2(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(run_script(tmp).returncode, 2)

    def test_explicit_path_overrides_git(self):
        self.add("x.ipynb", notebook(code_cell(execution_count=1)), track=False)
        self.assertEqual(run_script(self.repo, "x.ipynb").returncode, 1)


if __name__ == "__main__":
    unittest.main()
