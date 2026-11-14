import * as React from "react";

import type { ToastActionElement, ToastProps } from "@/components/ui/Toast";

// Defines the maximum number of notification toast alerts rendered simultaneously.
// Caps active toast count to one to prevent visual clutter and screen obstruction.
// Causes newly dispatched toasts to displace older visible notifications immediately.
const TOAST_LIMIT = 1;
// Specifies the dismissal grace period before a closed toast is purged from state.
// Retains dismiss animation state before permanently clearing the toast item.
// Prevents abrupt UI snapping by allowing exit transitions to conclude smoothly.
const TOAST_REMOVE_DELAY = 1000000;

// Represents an individual toast notification instance managed in application state.
// Extends visual toast properties with unique identifiers, descriptions, and action buttons.
// Drives the rendering parameters for active toast alert popups.
type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

// Enumerates state action constants governing the toast notification reducer lifecycle.
// Covers adding newly triggered toasts, updating active alerts, dismissing, and removal.
// Guarantees type-safe dispatch signatures across all toast notification operations.
const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const;

let count = 0;

// Generates unique ascending numerical string identifiers for newly created toasts.
// Increments an in-memory counter with integer wrap-around bounds checking.
// Guarantees stable React reconciliation keys for active notification alerts.
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

// Type alias representing the literal type mapping of supported toast action constants.
// Reflects the actionTypes dictionary for strict TypeScript discriminated unions.
// Enforces compile-time validation on all toast state mutation payloads.
type ActionType = typeof actionTypes;

// Discriminated union of action payloads processed by the toast state machine reducer.
// Binds specific toast payloads to their corresponding action command types.
// Governs state transitions across notification generation, editing, and dismissal.
type Action =
  | {
      type: ActionType["ADD_TOAST"];
      toast: ToasterToast;
    }
  | {
      type: ActionType["UPDATE_TOAST"];
      toast: Partial<ToasterToast>;
    }
  | {
      type: ActionType["DISMISS_TOAST"];
      toastId?: ToasterToast["id"];
    }
  | {
      type: ActionType["REMOVE_TOAST"];
      toastId?: ToasterToast["id"];
    };

// Defines the in-memory toast notification state container interface.
// Maintains the collection array of active and recently dismissed toast alerts.
// Broadcasts state changes to all subscribed toast viewer components.
interface State {
  toasts: ToasterToast[];
}

// In-memory mapping tracking scheduled removal timers for dismissed toast alerts.
// Maps unique toast identifiers to their corresponding setTimeout timer handles.
// Facilitates timer cancellation and memory cleanup during fast toast rotations.
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

// Schedules the permanent removal dispatch of a dismissed toast from memory.
// Establishes a removal timeout handle and stores it within the timeouts map.
// Ensures toast records are purged from state after exit transitions conclude.
const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

// State reducer managing the queue of active and dismissed toast notifications.
// Handles adding, updating, soft-dismissing, and hard-removing notification entries.
// Enforces display limits and updates open flags to trigger exit animations.
export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };

    case "DISMISS_TOAST": {
      const { toastId } = action;

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      };
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

const listeners: Array<(state: State) => void> = [];

let memoryState: State = { toasts: [] };

// Dispatches state transitions to the global in-memory toast reducer store.
// Evaluates the new state snapshot and notifies all registered listener callbacks.
// Enables toast triggers from both React components and external utility modules.
function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

// Type contract defining user-provided parameters for triggering a toast notification.
// Omits internal system-generated identifiers from required caller options.
// Accepts titles, descriptive text, action elements, and visual variant themes.
type Toast = Omit<ToasterToast, "id">;

// Imperative utility function triggering a toast notification anywhere in the app.
// Assigns a unique identifier and registers the alert into global memory state.
// Returns dismissal and update handles allowing callers to alter the active toast.
function toast({ ...props }: Toast) {
  const id = genId();

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    });
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id });

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  return {
    id: id,
    dismiss,
    update,
  };
}

// Custom React hook subscribing components to the global toast notification store.
// Synchronizes local component state with global memory toast array changes.
// Exposes the current toasts array, toast trigger utility, and dismissal functions.
function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  };
}

export { useToast, toast };
