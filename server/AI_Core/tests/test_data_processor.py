from tools.data_processors import DataProcessor


def test_categorize_transactions_prefers_explicit_type():
    transactions = [
        {
            "amount": -4500,
            "description": "Salary transfer correction",
            "category": "Housing",
            "type": "expense",
        },
        {
            "amount": 65000,
            "description": "Main income",
            "category": "Salary",
            "type": "income",
        },
        {
            "amount": -2500,
            "description": "ETF SIP",
            "category": "Investments",
            "type": "investment",
        },
    ]

    categorized = DataProcessor.categorize_transactions(transactions)

    assert len(categorized["income"]) == 1
    assert len(categorized["expenses"]) == 1
    assert len(categorized["investments"]) == 1