# Product conversion event specification

[简体中文](../analytics.md) · **English**

![Product browse-to-CMS journey](../images/customer-journey.svg)

## Funnel

The stable events are `product_view`, `product_search`, `product_compare`, `resource_download`, `inquiry_start`, and `inquiry_submit`. A practical funnel is catalog/detail → compare/download → inquiry start → successful submit.

Allowed metadata is limited to product/entity ids and titles, safe page/source/CTA labels, result count, comparison count and coarse operational context. Names, phones, emails, addresses, messages, cookies, tokens and arbitrary nested personal fields are removed.

## Mixpanel boundary

Forwarding is enabled only when the public feature flag is on, consent requirements are met, and the deployment injects the SDK/configuration. API-side event storage remains the auditable fallback; inquiry success is based on the business response, not analytics delivery.

## Data quality

- Fire one semantic event per action; do not use click text as an unstable event name.
- Use the same release/environment vocabulary across clients.
- Monitor missing/duplicate events and sudden funnel breaks.
- Apply configured retention and never join analytics to customer contact fields.
