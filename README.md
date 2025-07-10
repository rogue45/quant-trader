# quant-trader
A crypto tradebot that works with coinbase to target volatility.

Market data: first I created a simple containerized nodejs app that fetches current market data and stores it to a containerized influx db. 
Once i had historical market data it was on to the tradebot.
I then created a simple tradebot loop. It looks at configured crypto tickers to watch. Every minute it loops over them and first analyzes configured buy rules. If i have available funds and finds any positive match it buys a configured amount. Currently i have a cooldown time to wait before another action to space out purchases.

Sell rules for current holdings are then iteratively checked for a match.

Each rule object within buy_rules and sell_rules arrays has the following structure:

```
{
"id": "unique_rule_identifier",       // A unique name for this rule (e.g., "buy_sma_dip_btc")
"description": "Human-readable description of the rule.",
"type": "rule_type_identifier",       // Specifies the type of signal (see supported types below)
"params": { /* Rule-specific parameters */ } // An object containing parameters for this rule type
}
```

### Example rules configurations
```
"buy_rules": [
    {
        "id": "buy_on_lower_bb_cross_40_2",
        "description": "Buy if price crosses below or touches the lower Bollinger Band (40-period, 2 StdDev).",
        "type": "bollinger_lower_band_cross",
        "params": {
            "period": 40,
            "std_dev_multiplier": 2.0
        }
    },
    {
        "id": "7% dip from sma",
        "description": "Buy if price drops 7% from sma",
        "type": "sma_dip_percentage",
        "params": {
            "sma_days": 3,
            "percentage_below_sma": 7
        }
    }
],
"sell_rules": [
    {
        "id": "sell_on_5pct_profit",
        "description": "Sell if price is 5% or more above the purchase price.",
        "type": "profit_percentage_target",
        "params": {
            "percentage_above_purchase": 7.0
        }
    }
],
```

# Run instructions
1)  Must be running market data container which populates influx db.
2) Configure influx db. Put its key in an env var: INFLUX_DB_TOKEN
3) Get an api key from coinbase. It should save a file for you. Name it cdp_api_key.json and place it in the auth directory
4) Run things locally or build docker image
5) Push it to your image repo of choice
6) Profit.

### Image build instructions:
```docker build -t tradebot .```

### Tag
```docker tag tradebot:latest 192.168.1.53:5000/tradebot:latest```

### Push
```docker push 192.168.1.53:5000/tradebot:latest```
