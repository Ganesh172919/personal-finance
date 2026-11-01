with open(r"c:\Users\RAVIPRAKASH\personal-finance\client\src\pages\Transactions.tsx", "r", encoding="utf-8") as f:
    text = f.read()

target = "  const handleSubmitRecurringRule = () => {"
replacement = """  const handleSubmitRecurringRule = () => {
    console.log('[DEBUG handleSubmitRecurringRule]', {
      recurringTargetTransaction: Boolean(recurringTargetTransaction),
      ruleName,
      ruleAmount,
      ruleFrequency,
      disabled: !ruleName.trim() || !Number(ruleAmount) || createRecurringRuleMutation.isPending
    });"""

text = text.replace(target, replacement, 1)

with open(r"c:\Users\RAVIPRAKASH\personal-finance\client\src\pages\Transactions.tsx", "w", encoding="utf-8") as f:
    f.write(text)

print("Added debug log to Transactions.tsx")
