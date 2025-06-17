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



Image build instructions:
1) commit code change