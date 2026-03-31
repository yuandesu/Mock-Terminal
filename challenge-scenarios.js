// challenge-scenarios.js — Vim Challenge Scenario Definitions
// Each scenario: { id, title, description, buffer, cursor [line,col], target, par_keystrokes, par_seconds }

const CHALLENGE_SCENARIOS = [
  {
    id: 'dd-blank-line',
    title: 'Delete the blank line',
    description: 'Remove the empty line between the two lines.',
    buffer: 'hello world\n\ngoodbye world',
    cursor: [1, 0],
    target: 'hello world\ngoodbye world',
    par_keystrokes: 2,
    par_seconds: 3
  },
  {
    id: 'ci-quote',
    title: 'Change inside quotes',
    description: 'Clear the string argument — leave the quotes empty. Cursor is on the opening ".',
    buffer: 'console.log("hello world")',
    cursor: [0, 12],
    target: 'console.log("")',
    par_keystrokes: 3,
    par_seconds: 5
  },
  {
    id: 'yy-paste',
    title: 'Duplicate the line',
    description: 'Copy the current line and paste it below.',
    buffer: 'foo = "bar"',
    cursor: [0, 0],
    target: 'foo = "bar"\nfoo = "bar"',
    par_keystrokes: 3,
    par_seconds: 4
  },
  {
    id: 'G-delete-last',
    title: 'Delete the last line',
    description: 'Jump to the last line and delete it.',
    buffer: 'line 1\nline 2\ndelete me',
    cursor: [0, 0],
    target: 'line 1\nline 2',
    par_keystrokes: 3,
    par_seconds: 4
  },
  {
    id: 'A-append',
    title: 'Append a semicolon',
    description: 'Add a semicolon at the end of the line without leaving normal mode more than once.',
    buffer: 'return x + y',
    cursor: [0, 0],
    target: 'return x + y;',
    par_keystrokes: 3,
    par_seconds: 4
  }
];
