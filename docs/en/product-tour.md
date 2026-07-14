# Product and customer journey

[简体中文](../product-tour.md) · **English**

This journey follows a visitor from brand context to selection, inquiry and CMS follow-up.

![Browse, compare, inquire and operate](../images/customer-journey.svg)

## Home and catalog

![Brand homepage](../screenshots/01-homepage.jpg)

The homepage establishes trust and routes visitors toward products, support and brand material. The catalog combines keywords, category, price/availability and sorting without hiding the current filter state.

![Product search and filters](../screenshots/02-products.jpg)

## Comparison and detail

![Accessible product comparison](../screenshots/07-product-compare.png)

Visitors can compare up to three products on a scan-friendly surface. The modal traps focus, closes with Escape and returns focus to its trigger. Product detail presents specifications, scenes, warranty, related items and a persistent next step without inventing price or certification claims.

| Desktop detail | Mobile detail |
| --- | --- |
| ![Desktop product detail and inquiry action](../screenshots/11-product-detail-desktop.png) | ![Mobile product detail with persistent inquiry action](../screenshots/12-product-detail-mobile.png) |

## Inquiry

![Inquiry form](../screenshots/08-inquiry-form.png)

The form requests only necessary contact and selection context, uses bot/time/rate protections, and reports success only after API `201`. Product analytics receives the event type and safe product context, never the form body.

## CMS follow-up

| Operations dashboard | Inquiry queue |
| --- | --- |
| ![CMS operations dashboard](../screenshots/03-admin-dashboard.jpg) | ![CMS inquiry queue](../screenshots/15-cms-crm-inquiries.png) |

New inquiries become auditable CRM work. Permissions govern private fields, status changes and exports. Content can be published and restored without bypassing the same API boundary.

## Responsive acceptance

| Tablet | Mobile filters | Mobile navigation |
| --- | --- | --- |
| ![Tablet product list](../screenshots/04-tablet-products.jpg) | ![Mobile filters](../screenshots/05-mobile-products.jpg) | ![Mobile navigation](../screenshots/09-mobile-navigation.png) |

Acceptance covers browse → filter → compare → detail → inquiry → CMS follow-up on keyboard, desktop, tablet and phone.
