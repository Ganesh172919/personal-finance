"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { Slot } from "@radix-ui/react-slot";
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/Label";

// Re-export of react-hook-form FormProvider as the root Form context wrapper.
// Shares react-hook-form methods and state across nested form controls.
// Coordinates form submission, validation triggers, and value bindings.
const Form = FormProvider;

// Context value shape binding a specific field path to its input control.
// Generic over form field values and valid key paths in the schema.
// Consumed by downstream inputs and labels to coordinate field identifiers.
type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> = {
  name: TName;
};

// React context instance providing field name identification to controls.
// Established by FormField to scope nested labels, inputs, and validation messages.
// Defaults to empty object before provider initialization.
const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
);

// Controller wrapper binding a react-hook-form field to visual UI components.
// Injects field name context and passes Controller render props to children.
// Handles change events, blur states, and validation values reactively.
const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

// Custom hook retrieving active form field state, IDs, and validation errors.
// Generates synchronized HTML IDs for labels, descriptions, and error messages.
// Enforces execution inside a FormField provider boundary.
const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState, formState } = useFormContext();

  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>");
  }

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

// Shape of the FormItem context containing the unique field item ID.
// Used to establish unique identifier prefixes for accessibility linkage.
// Passed between parent form item containers and nested control elements.
type FormItemContextValue = {
  id: string;
};

// React context instance supplying generated IDs across form field components.
// Bridges FormItem containers with child FormLabel, FormControl, and messages.
// Initialized to an empty object placeholder until populated by FormItem.
const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
);

// Structural layout container grouping a form label, input control, and message.
// Generates unique accessible ID prefix and provides vertical spacing.
// Forwards DOM references to the outer container div element.
const FormItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div ref={ref} className={cn("space-y-2", className)} {...props} />
    </FormItemContext.Provider>
  );
});
FormItem.displayName = "FormItem";

// Accessible form label associated with the corresponding form field control.
// Connects htmlFor attribute to the generated formItemId automatically.
// Highlights with destructive text color whenever validation errors occur.
const FormLabel = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => {
  const { error, formItemId } = useFormField();

  return (
    <Label
      ref={ref}
      className={cn(error && "text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  );
});
FormLabel.displayName = "FormLabel";

// Slot wrapper linking native input elements to form validation attributes.
// Injects aria-invalid and aria-describedby pointing to descriptions and errors.
// Uses Radix UI Slot to clone attributes directly onto child input components.
const FormControl = React.forwardRef<
  React.ElementRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } =
    useFormField();

  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  );
});
FormControl.displayName = "FormControl";

// Helper text component providing instructional guidance under a form control.
// Connects unique formDescriptionId to the control's aria-describedby attribute.
// Styled with small font size and muted colors for secondary legibility.
const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField();

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
});
FormDescription.displayName = "FormDescription";

// Validation error feedback component rendering react-hook-form error messages.
// Connects unique formMessageId to control aria-describedby attributes.
// Automatically hides when no validation errors are present on the field.
const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message ?? "") : children;

  if (!body) {
    return null;
  }

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  );
});
FormMessage.displayName = "FormMessage";

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
};
