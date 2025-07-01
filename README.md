# quant-trader
Holds quant trading algorithms and utilizes quant-datafetcher data for algo decisions.

Each rule object within buy_rules and sell_rules arrays has the following structure:
{
"id": "unique_rule_identifier",       // A unique name for this rule (e.g., "buy_sma_dip_btc")
"description": "Human-readable description of the rule.",
"type": "rule_type_identifier",       // Specifies the type of signal (see supported types below)
"params": { /* Rule-specific parameters */ } // An object containing parameters for this rule type
}

See docs for specific configurations supported.
https://docs.google.com/document/d/1QNJei_zLhj68I72-ym1-PngyNr4Le1sJFflYinJM1MQ/edit?tab=t.0


# Run instructions
1)  Must be running market data container which populates influx db.
2) Configure influx db. Put its key in an env var: INFLUX_DB_TOKEN
3) Get an api key from coinbase. It should save a file for you. Name it cdp_api_key.json and place it in the auth directory
4) Run things locally or build docker image
5) Push it to your image repo of choice
6) Profit.

# Image build instructions:
# To build the docker image
# docker build -t tradebot .

# Tag
# docker tag tradebot:latest 192.168.1.53:5000/tradebot:latest

# Push
# docker push 192.168.1.53:5000/tradebot:latest



## Example rules
### So far i've only played with sma buys and bb lower buys. 
#### Bb lower correctly identified the downturn but using std dev of 2 made it pretty sensative and it bought a bit early. I added to cooldown period to negate this.
#### So far i like sma % best. It will purchase if price moves n% below 1 day moving avg.
#### I've only used sell % above purchase price. It sells everything at n % above average price.

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