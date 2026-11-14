file_path = r"c:\Users\RAVIPRAKASH\personal-finance\client\src\pages\Transactions.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

# Replace mutationFn
text = text.replace("    mutationFn: createRecurringRule,", "    mutationFn: (body: any) => createRecurringRule(body),")

# Remove debug log
debug_str = """    console.log('[DEBUG handleSubmitRecurringRule]', {
      recurringTargetTransaction: Boolean(recurringTargetTransaction),
      ruleName,
      ruleAmount,
      ruleFrequency,
      disabled: !ruleName.trim() || !Number(ruleAmount) || createRecurringRuleMutation.isPending
    });\n"""
text = text.replace(debug_str, "")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

print("Updated Transactions.tsx")
