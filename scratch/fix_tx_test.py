test_file = r"c:\Users\RAVIPRAKASH\personal-finance\client\src\pages\Transactions.test.tsx"
with open(test_file, "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('Select all visible (3)', 'Select all visible (4)')
text = text.replace('/3 selected/i', '/4 selected/i')

with open(test_file, "w", encoding="utf-8") as f:
    f.write(text)

print("Updated Transactions.test.tsx")
