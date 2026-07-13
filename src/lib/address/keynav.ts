// Keyboard-navigation logic for the address autocomplete, extracted as a pure
// function so it can be unit-tested without a DOM.
//
// The autocomplete input lives inside a <form> (the create- and edit-project
// dialogs). A bare Enter in a text input submits the surrounding form — which,
// on the create flow, fired createProject BEFORE the user had picked an address
// from the list, so the project was created with a name only and the user had
// to go back and re-enter the address (SCRUM-335: "bounces / requires
// re-entering the details when no sample is selected"). The invariant this
// encodes: Enter must NEVER reach the form's submit from the address field —
// with a list open it chooses the highlighted suggestion; otherwise it is
// swallowed. Submitting stays the job of the explicit button and the name field.

export type AddressKeyAction =
  | { type: "move"; highlight: number }
  | { type: "select"; index: number }
  | { type: "close" }
  | { type: "preventSubmit" }
  | { type: "passthrough" };

export interface AddressKeyState {
  /** Whether the suggestions dropdown is currently open. */
  open: boolean;
  /** Number of suggestions currently shown. */
  count: number;
  /** Index of the currently highlighted suggestion. */
  highlight: number;
}

/**
 * Decide what a key press should do in the address autocomplete input.
 * Pure — the component maps the returned action onto preventDefault/state.
 */
export function resolveAddressKey(
  key: string,
  state: AddressKeyState,
): AddressKeyAction {
  const { open, count, highlight } = state;
  const listActive = open && count > 0;

  switch (key) {
    case "ArrowDown":
      return listActive
        ? { type: "move", highlight: Math.min(highlight + 1, count - 1) }
        : { type: "passthrough" };
    case "ArrowUp":
      return listActive
        ? { type: "move", highlight: Math.max(highlight - 1, 0) }
        : { type: "passthrough" };
    case "Enter":
      // Never let Enter submit the form from here (the SCRUM-335 fix).
      return listActive
        ? { type: "select", index: Math.min(Math.max(highlight, 0), count - 1) }
        : { type: "preventSubmit" };
    case "Escape":
      return open ? { type: "close" } : { type: "passthrough" };
    default:
      return { type: "passthrough" };
  }
}
