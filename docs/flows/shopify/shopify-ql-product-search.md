# ShopifyQLProductSearch

<!-- generated:start -->
**ShopifyQLProductSearch** · `shopify-ql-product-search` · version 3.0.0 · **entry point** (intent detection can start it) · steps · isolated scope

> Wants to find, price or check availability of a product, including one named alone ('tires') or on sale ('¿tienen televisores en oferta?'); wants to place a new order ('quiero hacer un pedido de un televisor', 'I want to order a TV'); or asks about the products shown. Not: sales, specials, deals or promotions in general ('¿qué especiales tienen para Black Friday?') with no product named (None); 'I have an order for X', 'I placed an order for X', 'tengo un pedido de X' or 'hice un pedido de X', whatever X is: that order already exists, so it is order tracking, never a search; when a product will be restocked (None); store policies; interest, APR or financing terms, advice or greetings (None).

- **Parameters:** 
  - `search_query`: Product type, brand and features named by the caller, in the original language. Extract the product phrase from a question asking whether it is sold, its price or availability. Leave unset only when no product is named, such as a greeting or a reference to prior results; put changed constraints on prior products in refinement.
  - `refinement`: Changed color, size, budget or features for products previously shown, such as in white or under 200 dollars. Leave search_query empty when the caller refers to prior products rather than naming a new product.
  - `user_city`: City and state, state, ZIP, or store location explicitly named
  - `product_number`: Position among the products last shown, 1 through 3 on voice or 1 through 5 in text
  - `refresh`: True only for an explicit request to refresh online product availability
  - `asked` (results / stock / price / cheapest / details / stores): results: Find products or show the previously shown products. stock: Which of the shown products are in stock online; not physical store inventory. price: Prices of shown products or a selected product. cheapest: Cheapest among the products shown, not a claim about the entire catalog. details: Details of a listed product. stores: Stores near a city/state/ZIP with the selected product variant in stock
- **Calls:** [shopify-ql-product-facts-load](shopify-ql-product-facts-load.md) (call), [shopify-ql-product-stores](shopify-ql-product-stores.md) (call), [shopify-ql-shown-product-read](shopify-ql-shown-product-read.md) (call), [shopify-ql-products-fetch](shopify-ql-products-fetch.md) (call), [text-destination](../system/text-destination.md) (system) (call), [provide-data](../system/provide-data.md) (system) (call), [shopify-ql-product-dialog](shopify-ql-product-dialog.md) (replace)
- **Tools:** none
- **Called by:** intent detection, [shopify-ql-product-dialog](shopify-ql-product-dialog.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set request_said"]
   START --> n0
   n1[["call shopify-ql-shown-product-read"]]
   class n1 flowstep
   n0 --> n1
   n2["set request"]
   n1 --> n2
   c3{"case"}
   n2 --> c3
   b4(["return to host / AI"])
   class b4 endstep
   c3 -- "request.done" --> b4
   n5["set noop"]
   c3 -- "else" --> n5
   c6{"case"}
   n5 --> c6
   b7(["return to host / AI"])
   class b7 endstep
   c6 -- "!request.query" --> b7
   c8{"case"}
   c6 -- "else" --> c8
   b9[["call shopify-ql-products-fetch"]]
   class b9 flowstep
   c8 -- "!cargo.shopifyProductRequest.reuse" --> b9
   c10{"case"}
   b9 --> c10
   c8 -- "else" --> c10
   b11(["return to host / AI"])
   class b11 endstep
   c10 -- "cargo.shopifyProducts.products.length===0" --> b11
   c12{"case"}
   c10 -- "else" --> c12
   b13["say: Please choose a product number from the list shown."]
   c12 -- "cargo.shopifyProductRequest.invalidSelection" --> b13
   n14["set noop"]
   b13 --> n14
   c12 -- "else" --> n14
   c15{"case"}
   n14 --> c15
   b16[["call text-destination"]]
   class b16 flowstep
   c15 -- "!!cargo.voice" --> b16
   n17["set noop"]
   b16 --> n17
   c15 -- "else" --> n17
   c18{"case"}
   n17 --> c18
   b19[["call provide-data"]]
   class b19 flowstep
   c18 -- "request.asked==='stores' && !request.reuse" --> b19
   n20[["call provide-data"]]
   class n20 flowstep
   b19 --> n20
   c18 -- "else" --> n20
   n21(["replace → shopify-ql-product-dialog"])
   class n21 endstep
   n20 --> n21
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
