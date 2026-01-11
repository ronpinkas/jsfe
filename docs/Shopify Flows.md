# Shopify Flows Library

This document details the e-commerce flows provided in the `flows/shopify.flows.json` library. These flows provide integration with Shopify for product search, order tracking, and store policy inquiries.

## Table of Contents
- [ShopifyProductSearch](#shopifyproductsearch)
- [GetSearchQuery](#getsearchquery)
- [ShopifyTrackOrder](#shopifytrackorder)
- [ShopifyGetOrdersVerified](#shopifygetordersverified)
- [ShopifyStorePolicies](#shopifystorepolicies)

---

## ShopifyProductSearch
**ID**: `shopify-product-search`  
**Triggers**: "product search", "buscar producto"  
**Description**: Help customers search for products, check stock availability, and find local store availability.

This flow powers natural language product discovery. It captures a user's search intent, queries the Shopify catalog via `shopify-search-products`, and formats the results with pricing and stock status. Uniquely, it extends the digital experience to physical retail by allowing users to check inventory at nearby store locations (`shopify-store-availability`) for a selected product variant.

### Parameters
*   `search_query` (string): The product name, brand, or features to search for.

### Flowchart
```mermaid
graph TD
    start((Start)) --> get_search_query_if_no_param{Check Param}
    get_search_query_if_no_param -->|Missing| ask_for_search_query[FLOW: GetSearchQuery]
    get_search_query_if_no_param -->|Present| proceed_with_search[SET]
    
    ask_for_search_query --> search_products[TOOL: shopify-search-products]
    proceed_with_search --> search_products
    
    search_products --> display_results{Results Found?}
    search_products -.->|On Fail| search_failed[FLOW: NoActionNeeded]
    
    display_results -->|Found| show_results[SAY: List Products]
    display_results -->|None| no_results[FLOW: NoActionNeeded]
    
    show_results --> check_global_store_locations{Check Local Stores}
    check_global_store_locations -->|Stores Configured| ask_store_check[SAY-GET: Check local stock?]
    check_global_store_locations -->|No Stores| all_done[SAY-GET: Anything else?]
    
    ask_store_check --> check_product_choice{User Choice}
    check_product_choice -->|Done/No| end_search[RETURN]
    check_product_choice -->|Select 1-5| set_product_idx[SET: Index]
    check_product_choice -->|No Input| no_choice_made[RETURN]
    check_product_choice -->|Default| invalid_choice[FLOW: NoActionNeeded]
    
    set_product_idx --> set_selected_product[SET]
    set_selected_product --> ask_city[SAY-GET: Which city?]
    ask_city --> normalize_city[SET]
    normalize_city --> set_selected_variant[SET: Pick Variant]
    
    set_selected_variant --> check_variant_valid{Variant OK?}
    check_variant_valid -->|Yes| lookup_store_availability[TOOL: shopify-store-availability]
    check_variant_valid -->|No| no_variants[RETURN: Error]
    
    lookup_store_availability --> display_availability{Check Stock}
    lookup_store_availability -.->|On Fail| availability_failed[RETURN: Error]
    
    display_availability -->|In Stock| show_stores[RETURN: Store List]
    display_availability -->|Out of Stock| no_stock[RETURN: Online only]
    display_availability -->|Error| availability_error[RETURN: Error]
    
    search_failed --> stop((End))
    no_results --> stop
    all_done --> stop
    end_search --> stop
    no_choice_made --> stop
    invalid_choice --> stop
    no_variants --> stop
    availability_failed --> stop
    show_stores --> stop
    no_stock --> stop
    availability_error --> stop
```

---

## GetSearchQuery
**ID**: `get-search-query`  
**Description**: Helper flow to request a search string from the user.

A helper flow that ensures a valid search term is captured. If the user hasn't provided a query yet, it prompts them explicitly ("What are you looking for?"). It handles the input normalization and checks for exit commands before returning the query to the parent flow.

### Flowchart
```mermaid
graph TD
    start((Start)) --> ask_what_looking_for[SAY-GET: What product?]
    ask_what_looking_for --> normalize_search[SET: trim]
    normalize_search --> check_for_exit{Check Input}
    
    check_for_exit -->|Exit/Abort| abort_search[FLOW: CancelProcess]
    check_for_exit -->|Live Agent| goto_live_agent[FLOW: LiveAgentRequested]
    check_for_exit -->|Default| proceed_with_search[SET: proceed=true]
    
    abort_search --> stop((End))
    goto_live_agent --> stop
    proceed_with_search --> stop
```

---

## ShopifyTrackOrder
**ID**: `shopify-track-order`  
**Triggers**: "track order", "rastrear pedido"  
**Description**: Help customers view orders and track status. Enforces authentication via `AuthenticateUser`.

This flow handles post-purchase inquiries. Recognizing that order data is sensitive, it enforces a security check by invoking `AuthenticateUser` before proceeding. Once identity is established, it forwards control to `ShopifyGetOrdersVerified` to display the data.

### Parameters
*   `order_number` (string): Specific order number to track.

### Flowchart
```mermaid
graph TD
    start((Start)) --> set_validate_if_from_param[SET]
    set_validate_if_from_param --> set_support_context[SET]
    set_support_context --> explain_verification[SAY: Need to verify]
    explain_verification --> check_otp_status{Verified?}
    
    check_otp_status -->|Verified| already_verified[FLOW: ShopifyGetOrdersVerified]
    check_otp_status -->|Not Verified| perform_auth[FLOW: AuthenticateUser]
    
    perform_auth --> proceed_to_orders[FLOW: ShopifyGetOrdersVerified]
    
    already_verified --> stop((End))
    proceed_to_orders --> stop
```

---

## ShopifyGetOrdersVerified
**ID**: `shopify-get-orders-verified`  
**Description**: Secure flow to list orders or get details for a verified user.

The core logic for order retrieval. It uses the `shopify-lookup-orders` tool to fetch recent order history for the verified user. It presents a summary list and allows the user to drill down into specific order details (using `shopify-get-order-status`) to see line items, fulfillment status, and tracking links.

### Flowchart
```mermaid
graph TD
    start((Start)) --> set_shopify_identifier[SET: Using confirmed email/phone]
    set_shopify_identifier --> call_tool_if_no_param{Specific Order?}
    
    call_tool_if_no_param -->|No Order #| lookup_orders[TOOL: shopify-lookup-orders]
    call_tool_if_no_param -->|Has Order #| skip_lookup[SET: Fake Result]
    
    lookup_orders -.->|On Fail| lookup_failed[FLOW: GenericRetryWithOptions]
    
    lookup_orders --> display_orders{Process Orders}
    skip_lookup --> display_orders
    
    display_orders -->|Error| lookup_error[FLOW: ContactSupport]
    display_orders -->|0 Orders| no_orders[RETURN]
    display_orders -->|1 Order| single_order_auto[SET: Auto Select]
    display_orders -->|Multiple| show_orders[SAY-GET: Select Order]
    
    single_order_auto --> check_single_order
    show_orders --> check_single_order{Has Selection?}
    
    check_single_order -->|Yes| skip_to_details[SET: go_to_details]
    check_single_order -->|No| continue_selection[SET]
    
    continue_selection --> handle_selection{User Input}
    handle_selection -->|1-5| get_order_details[SET: Select Order #]
    handle_selection -->|Default| finished[RETURN]
    
    skip_to_details --> get_specific_order
    get_order_details --> get_specific_order{Has Order #?}
    
    get_specific_order -->|Yes| fetch_order_status[TOOL: shopify-get-order-status]
    get_specific_order -->|No| unexpected_no_order[FLOW: ContactSupport]
    
    fetch_order_status -.->|On Fail| order_detail_failed[SAY: Error]
    fetch_order_status --> show_order_detail{Show Details}
    
    show_order_detail -->|Success| display_detail[SAY: Order Info]
    show_order_detail -->|Not Found| order_not_found[SAY: Not Found]
    
    lookup_failed --> stop((End))
    lookup_error --> stop
    no_orders --> stop
    finished --> stop
    unexpected_no_order --> stop
    order_detail_failed --> stop
    display_detail --> stop
    order_not_found --> stop
```

---

## ShopifyStorePolicies
**ID**: `shopify-store-policies`  
**Triggers**: "store policies", "políticas de la tienda"  
**Description**: Help customers find online store policies and FAQs.

This flow provides access to static store content. It captures a policy topic (e.g., "Returns", "Shipping") and uses the `shopify-search-policies` tool to retrieve relevant text from the store's knowledge base, returning the answer directly to the conversation.

### Parameters
*   `policy_query` (string): The user's question about store policies.

### Flowchart
```mermaid
graph TD
    start((Start)) --> check_policy_param{Check Param}
    check_policy_param -->|Missing| ask_policy_question[SAY-GET: What topic?]
    check_policy_param -->|Present| proceed_with_query[SET]
    
    ask_policy_question --> search_policies[TOOL: shopify-search-policies]
    proceed_with_query --> search_policies
    
    search_policies -.->|On Fail| policy_search_failed[FLOW: NoActionNeeded]
    
    search_policies --> display_policy{Found?}
    display_policy -->|Content| show_policy[SAY: Here is info]
    display_policy -->|No Content| no_policy_found[FLOW: NoActionNeeded]
    
    policy_search_failed --> stop((End))
    show_policy --> stop
    no_policy_found --> stop
```
