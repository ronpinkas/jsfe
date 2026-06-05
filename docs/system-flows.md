# System Flows Library

This document details the standard system flows provided in the `flows/system.flows.json` library. These flows handle common utility tasks such as authentication, error handling, and channel switching.

## Table of Contents
- [AuthenticateUser](#authenticateuser)
- [GetCellOrEmail](#getcelloremail)
- [GetAndValidateOtpCode](#getandvalidateotpcode)
- [ValidateOtpCode](#validateotpcode)
- [SwitchToText](#switchtotext)
- [LiveAgentRequested](#liveagentrequested)
- [ContactSupport](#contactsupport)
- [CancelProcess](#cancelprocess)
- [NoActionNeeded](#noactionneeded)
- [GenericRetryWithOptions](#genericretrywithoptions)
- [RetryAuthenticateGeneric](#retryauthenticategeneric)

---

## AuthenticateUser
**ID**: `authenticate-user`  
**Description**: Generic flow to authenticate user via OTP sent to cell or email.

This flow acts as the primary security gatekeeper. It orchestrates the complete authentication lifecycle by first checking existing verification status. If unverified, it delegates to `GetCellOrEmail` to capture contact details, determines the appropriate delivery channel (SMS vs Email), and dispatches a One-Time Password (OTP). It then hands off to `GetAndValidateOtpCode` for user input verification, setting the `auth_result` variable upon success.

### Parameters
*   `retry_flow` (string): Flow to reboot if user wants to retry (default: authenticate-user)
*   `cancel_flow` (string): Flow to reboot if user cancels (default: cancel-process)

### Variables
*   `cell_or_email` (string): User cell or email
*   `cell_number` (string): Customer cell phone number
*   `email` (string): Customer email address

### Flowchart
```mermaid
graph TD
    start((Start)) --> check_already_verified{Check Already Verified}
    check_already_verified -->|cargo.otpVerified| already_verified[FLOW: NoActionNeeded]
    check_already_verified -->|Default| get_contact_info[FLOW: GetCellOrEmail]
    get_contact_info --> send_otp_based_on_contact{Send OTP}
    send_otp_based_on_contact -->|cell_number| send_sms_otp[TOOL: send-sms-otp]
    send_otp_based_on_contact -->|email| send_email_otp[TOOL: send-email-otp]
    send_otp_based_on_contact -->|Default| no_contact_error[FLOW: RetryAuthenticateGeneric]
    
    send_sms_otp --> set_cell_number_to_cargo[SET: cargo.otp_cell_number]
    send_sms_otp -.->|On Fail| sms_failed[FLOW: RetryAuthenticateGeneric]
    
    send_email_otp --> set_email_to_cargo[SET: cargo.otp_email]
    send_email_otp -.->|On Fail| email_failed[FLOW: RetryAuthenticateGeneric]
    
    set_cell_number_to_cargo --> get_and_validate_otp_code[FLOW: GetAndValidateOtpCode]
    set_email_to_cargo --> get_and_validate_otp_code
    
    get_and_validate_otp_code --> check_validation_result{Check Result}
    check_validation_result -->|cargo.otpVerified| auth_success[SET: auth_result=true]
    check_validation_result -->|Default| auth_failed[FLOW: RetryAuthenticateGeneric]
    
    auth_success --> stop((End))
    already_verified --> stop
    no_contact_error --> stop
    sms_failed --> stop
    email_failed --> stop
    auth_failed --> stop
```

---

## GetCellOrEmail
**ID**: `get-cell-or-email`  
**Description**: Prompt user to provide either their cell phone number or email address for account lookup.

This flow serves as a flexible input collector for contact information. It is designed to handle ambiguity, accepting inputs that could be phone numbers or email addresses. It includes logic to parse and normalize these inputs, stripping formatting characters and validating against regex patterns. It also supports "Caller ID" usage if available from the telephony provider, and handles exit or live agent requests gracefully.

### Parameters
*   `retry_flow` (string): Flow to reboot if user wants to retry
*   `cancel_flow` (string): Flow to reboot if user cancels

### Flowchart
```mermaid
graph TD
    start((Start)) --> ask_cell_or_email_if_no_param{Check Params}
    ask_cell_or_email_if_no_param -->|!cell & !email & callerId| ask_cell_or_email_with_caller_id[SAY-GET]
    ask_cell_or_email_if_no_param -->|!cell & !email| ask_cell_or_email[SAY-GET]
    ask_cell_or_email_if_no_param -->|Default| use_provided_contact[SET]
    
    ask_cell_or_email_with_caller_id --> treat_as_phone_number[SET: normalize]
    ask_cell_or_email --> treat_as_phone_number
    use_provided_contact --> treat_as_phone_number
    
    treat_as_phone_number --> treat_as_email_address[SET: extract email]
    treat_as_email_address --> treat_as_email_allow_spaces[SET]
    treat_as_email_allow_spaces --> normalize_prospective_email[SET]
    normalize_prospective_email --> normalize_cell_or_email[SET: cleanup]
    
    normalize_cell_or_email --> branch_on_cell_or_email{Validate Input}
    branch_on_cell_or_email -->|Valid Phone| valid_phone[SET: cell_number]
    branch_on_cell_or_email -->|Valid Email| valid_email[SET: email]
    branch_on_cell_or_email -->|Caller ID Request| use_caller_id[SET: callerId]
    branch_on_cell_or_email -->|Abort/Exit| abort_process[FLOW: cancel_flow]
    branch_on_cell_or_email -->|Live Agent| goto_live_agent[FLOW: LiveAgentRequested]
    branch_on_cell_or_email -->|Default| retry_cell_or_email[FLOW: GenericRetryWithOptions]
    
    valid_phone --> stop((End))
    valid_email --> stop
    use_caller_id --> stop
    abort_process --> stop
    goto_live_agent --> stop
    retry_cell_or_email --> stop
```

---

## GetAndValidateOtpCode
**ID**: `get-and-validate-otp-code`  
**Description**: Get and validate OTP code from user.

This flow manages the user interaction for entering the verification code. It informs the user where the code was sent (masking the destination for privacy), handles the input prompt, and sanitizes the user's response (removing non-digits). It delegates the actual verification logic to `ValidateOtpCode`.

### Flowchart
```mermaid
graph TD
    start((Start)) --> set_otp_destination[SET: destination]
    set_otp_destination --> formatted_otp_destination[SET: format for display]
    formatted_otp_destination --> get_otp_from_user[SAY-GET: Expect 6 digits]
    get_otp_from_user --> set_user_choice[SET]
    set_user_choice --> set_otp_code[SET: normalize numbers]
    set_otp_code --> proceed_to_validation[FLOW: ValidateOtpCode]
    proceed_to_validation --> stop((End))
```

---

## ValidateOtpCode
**ID**: `validate-otp-code`  
**Description**: Validate OTP code entered by user - sets `cargo.otpVerified` on success.

This flow encapsulates the validation logic. It calls the system tool `validate-otp` and evaluates the result. If the code is incorrect, it manages retry attempts or loops back to the input phase. It sets the critical `cargo.otpVerified` flag upon success.

### Flowchart
```mermaid
graph TD
    start((Start)) --> validate_otp_and_lookup{Check Format}
    validate_otp_and_lookup -->|Length 6| validate_otp[TOOL: validate-otp]
    validate_otp_and_lookup -->|Exit/Abort| abort_process[FLOW: ContactSupport]
    validate_otp_and_lookup -->|Live Agent| goto_live_agent[FLOW: LiveAgentRequested]
    validate_otp_and_lookup -->|Default| invalid_otp_format[SAY]
    
    validate_otp -.->|On Fail| otp_tool_error[FLOW: GetAndValidateOtpCode]
    validate_otp --> retry_if_bad_format{Check Format Retry}
    
    invalid_otp_format --> retry_if_bad_format
    
    retry_if_bad_format -->|Length 6| format_was_ok[SET: skip]
    retry_if_bad_format -->|Default| loop_back_for_code[FLOW: GetAndValidateOtpCode]
    
    format_was_ok --> check_validation_result{Check Result}
    check_validation_result -->|Verified| otp_success[SET: validated=true]
    check_validation_result -->|Default| otp_wrong_code_retry[SAY]
    
    otp_wrong_code_retry --> retry_if_wrong_code{Retry Logic}
    retry_if_wrong_code -->|Verified| already_verified[SET: skip]
    retry_if_wrong_code -->|Default| loop_back_for_new_code[FLOW: GetAndValidateOtpCode]

    otp_tool_error --> stop((End))
    abort_process --> stop
    goto_live_agent --> stop
    loop_back_for_code --> stop
    otp_success --> stop
    loop_back_for_new_code --> stop
    already_verified --> stop
```

---

## SwitchToText
**ID**: `switch-to-text`  
**Description**: Handles switching the interaction from Voice to SMS. Checks if already text, sends welcome SMS, and confirms.

This flow manages the channel migration from Voice to SMS. It checks if the current session is voice-based. If so, it composes a welcome message (potentially including a WhatsApp link) and uses the `switch-to-sms` tool to send it to the caller's ID. It then confirms the action to the user. Should be called using the "reboot" call type.

### Flowchart
```mermaid
graph TD
    start((Start)) --> check_already_text{Check Mode}
    check_already_text -->|Not Voice| already_text_mode[FLOW: NoActionNeeded]
    check_already_text -->|Default| proceed_with_sms[SET]
    
    proceed_with_sms --> set_welcome_message[SET: Create Message]
    set_welcome_message --> send_welcome_sms[TOOL: switch-to-sms]
    
    send_welcome_sms --> confirm_sms_sent[SAY: Text Sent]
    send_welcome_sms -.->|On Fail| sms_failed_flow[FLOW: ContactSupport]
    
    confirm_sms_sent --> stop((End))
    already_text_mode --> stop
    sms_failed_flow --> stop
```

---

## LiveAgentRequested
**ID**: `live-agent-requested`  
**Description**: Interception flow when user requests live agent. Attempts to defect to AI, then transfers if insisted.

This flow implements a deflection strategy. When a user requests a human agent, the AI first attempts to offer immediate assistance for common tasks (deflection). If the user insists (by pressing 0 or confirming), it facilitates the transfer mechanics, or informs the user if no agents are configured. Should be called using the "reboot" call type.

### Flowchart
```mermaid
graph TD
    start((Start)) --> ask_user_choice[SAY-GET: Press 1 for AI, 0 for Agent]
    ask_user_choice --> normalize_choice[SET]
    normalize_choice --> handle_choice{Decision}
    
    handle_choice -->|Stay with AI| continue_with_ai[SAY: Great]
    handle_choice -->|Transfer| transfer_to_agent{Check Number}
    
    transfer_to_agent -->|Has Number| confirm_transfer[RETURN: Transfer Msg]
    transfer_to_agent -->|No Number| no_agents_available[FLOW: ContactSupport]
    
    continue_with_ai --> stop((End))
    confirm_transfer --> stop
    no_agents_available --> stop
```

---

## ContactSupport
**ID**: `contact-support`  
**Description**: Provide customer service contact information.

A terminal flow that provides the user with support contact details (phone/email) when the AI cannot resolve the request or an error occurs. It supports English and Spanish localization. Should be called using the "reboot" call type.

### Flowchart
```mermaid
graph TD
    start((Start)) --> set_contact_info[SET: Info EN]
    set_contact_info --> set_contact_info_es[SET: Info ES]
    set_contact_info_es --> say_support_message[SAY: Contact details]
    say_support_message --> stop((End))
```

---

## CancelProcess
**ID**: `cancel-process`  
**Description**: Handle flow cancellation by user. Returns a localized cancellation message.

A simple utility flow to acknowledge a user's request to stop the current operation. It returns a localized confirmation message and ends the current flow stack. Should be called using the "reboot" call type.

### Flowchart
```mermaid
graph TD
    start((Start)) --> process_cancel_flow[RETURN: Cancellation Msg]
    process_cancel_flow --> stop((End))
```

---

## NoActionNeeded
**ID**: `no-action-needed`  
**Description**: Passive flow when no action is required, or to delegate handling back to the host.

A "noop" (no operation) flow used as a logical placeholder in branching scenarios. By returning an empty string (`''`), this flow signals the engine to delegate handling of the user's input back to the host application (usually a Conversational AI). This is particularly useful when a specialized flow (like a product search) is triggered but yields no results; calling `NoActionNeeded` allows the host AI to respond to the original prompt conversationally instead of the flow failing silently or providing a rigid error message. Should be called using the "reboot" call type.

### Flowchart
```mermaid
graph TD
    start((Start)) --> no_action_needed[RETURN: '']
    no_action_needed --> stop((End))
```

---

## GenericRetryWithOptions
**ID**: `generic-retry-with-options`  
**Description**: Generic flow to offer retry, switch to text, or contact support.

A comprehensive error recovery flow. It standardizes how errors are presented to users, offering explicit options to Retry (loop back), Switch to Text, or Exit. It includes "Smart Capture" capabilities to detect if the user simply answered the original question instead of navigating the menu.

### Flowchart
```mermaid
graph TD
    start((Start)) --> say_error_and_prompt[SAY-GET: Error + Retry?]
    say_error_and_prompt --> check_smart_capture[SET: normalizeAndFindCapture]
    check_smart_capture --> handle_smart_capture{Smart Capture}
    
    handle_smart_capture -->|Captured| reboot_with_captured_value[FLOW: retry_flow]
    handle_smart_capture -->|Default| normalize_choice[SET]
    
    normalize_choice --> handle_choice{User Choice}
    handle_choice -->|Retry/Yes| do_retry[FLOW: retry_flow]
    handle_choice -->|Switch Text| do_switch_text[FLOW: SwitchToText]
    handle_choice -->|Abort| do_abort[FLOW: ContactSupport]
    handle_choice -->|Default| do_cancel[FLOW: ContactSupport]
    
    reboot_with_captured_value --> stop((End))
    do_retry --> stop
    do_switch_text --> stop
    do_abort --> stop
    do_cancel --> stop
```

---

## RetryAuthenticateGeneric
**ID**: `retry-authenticate-generic`  
**Description**: Specialized retry loop for authentication failures.

A specialized version of the retry logic tailored for authentication. It allows the user to re-enter their OTP directly if the previous attempt failed, or restart the entire authentication flow (e.g., to correct a typo in their email/phone).

### Flowchart
```mermaid
graph TD
    start((Start)) --> clear_variables[SET: Clear cell/email]
    clear_variables --> retry_msg[SAY-GET: Retry Auth?]
    retry_msg --> normalize_user_choice[SET]
    normalize_user_choice --> handle_choice{Decision}
    
    handle_choice -->|OTP Entry| treat_as_otp_entry[SET: Extract OTP]
    handle_choice -->|Yes/Auth| retry_authenticate[FLOW: AuthenticateUser]
    handle_choice -->|Switch Text| switch_to_text[FLOW: SwitchToText]
    handle_choice -->|Live Agent| goto_live_agent[FLOW: LiveAgentRequested]
    handle_choice -->|Default/Abort| provide_contact_info_default[FLOW: ContactSupport]
    
    treat_as_otp_entry --> check_and_validate_otp{Check OTP}
    check_and_validate_otp -->|Valid| validate_otp[FLOW: ValidateOtpCode]
    check_and_validate_otp -->|Invalid| provide_contact_info_default
    
    validate_otp --> check_validation_result{Result}
    check_validation_result -->|Verified| auth_success[SET: auth_result=true]
    check_validation_result -->|Failed| auth_failed_again[FLOW: RetryAuthenticateGeneric]
    
    retry_authenticate --> stop((End))
    switch_to_text --> stop
    goto_live_agent --> stop
    provide_contact_info_default --> stop
    auth_success --> stop
    auth_failed_again --> stop
```
