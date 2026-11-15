export type Channel = "web" | "whatsapp" | "voice";

export interface Workflow {
  rank: number;
  title: string;
  description?: string;
  intent: string;
  pctVolume: number;
  complexity: "RAG-Only" | "API Tool-Call";
  channel: "Voice" | "WhatsApp" | "Web Chat";
  estMonthlyVolume: number;
  tool?: { name: string; args: string; returns: string };
}

export interface Complaint {
  source: string;
  quote: string;
  theme: string;
  aiFix: string;
  workflowRef: number | null;
  // Extended fields from live synthesis
  severity?: "high" | "medium" | "low";
  platform?: string;
  sourceUrl?: string;
}

export interface PolicyChunk {
  id: string;
  url: string;
  topic: string;
  snippet: string;
}

export interface IndustryProfile {
  label: string;
  benchmarks: {
    monthlyVolume: number;
    ahtMinutes: number;
    costPerAgentMonth: number;
    aiCostPerResolution: number;
    deflectionRate: number;
    agentCapacity: number;
    fteHour: number;
  };
  workflows: Omit<Workflow, "rank" | "estMonthlyVolume">[];
  complaints: Omit<Complaint, "workflowRef">[];
  policies: { topic: string; snippet: string }[];
  tools: { name: string; args: string; returns: string }[];
}

const PROFILES: Record<string, IndustryProfile> = {
  ecommerce: {
    label: "E-commerce & Marketplaces",
    benchmarks: {
      monthlyVolume: 42000, ahtMinutes: 7.5, costPerAgentMonth: 620,
      aiCostPerResolution: 0.11, deflectionRate: 0.62, agentCapacity: 1100, fteHour: 4.5,
    },
    workflows: [
      { title: "Order Status & Live Tracking", intent: "Where is my order", pctVolume: 26, complexity: "API Tool-Call", channel: "WhatsApp", tool: { name: "get_order_status", args: "order_id", returns: "status, eta, tracking_url" } },
      { title: "Returns & Refund Initiation", intent: "I want to return this", pctVolume: 18, complexity: "API Tool-Call", channel: "Web Chat", tool: { name: "check_return_eligibility", args: "order_id", returns: "eligible, window_ends, reason_codes" } },
      { title: "Refund Timeline Escalations", intent: "Where is my refund", pctVolume: 11, complexity: "RAG-Only", channel: "WhatsApp" },
      { title: "Cancel or Edit an Order", intent: "Cancel my order", pctVolume: 9, complexity: "API Tool-Call", channel: "Voice", tool: { name: "cancel_order", args: "order_id", returns: "cancelled, refund_issued" } },
      { title: "Payment Failed but Amount Debited", intent: "Money taken, no order", pctVolume: 7, complexity: "API Tool-Call", channel: "Voice", tool: { name: "verify_payment_status", args: "payment_ref", returns: "settled, auto_reversal_eta" } },
      { title: "Delivery Rescheduling", intent: "Reschedule delivery", pctVolume: 6, complexity: "API Tool-Call", channel: "WhatsApp", tool: { name: "reschedule_delivery", args: "order_id, new_slot", returns: "confirmed_slot" } },
      { title: "Warranty & Damaged Item Claims", intent: "Item arrived damaged", pctVolume: 5, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "Discount, Voucher & Price Match", intent: "Coupon not working", pctVolume: 5, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "Address Change After Dispatch", intent: "Wrong delivery address", pctVolume: 4, complexity: "API Tool-Call", channel: "Voice", tool: { name: "update_delivery_address", args: "order_id, address", returns: "updated" } },
      { title: "Account, Login & OTP Issues", intent: "Can't sign in", pctVolume: 9, complexity: "RAG-Only", channel: "Web Chat" },
    ],
    complaints: [
      { source: "Trustpilot", theme: "Refund delays", quote: "Returned the item three weeks ago and still no refund. Every time I chase it I get a different answer from a different agent.", aiFix: "An AI agent with a check_refund_status tool gives the exact settlement date on WhatsApp in seconds — no chasing, no queue." },
      { source: "App Store", theme: "Bot dead-ends", quote: "The in-app 'assistant' just loops the same three FAQ links. Asking for a human takes 40 minutes.", aiFix: "A grounded agent resolves the top 10 intents end-to-end and escalates with a full context summary when it can't — cutting dead-end loops to zero." },
      { source: "Reddit", theme: "Hold times", quote: "Waited 52 minutes on hold to change a delivery slot. Hung up and ate the cost.", aiFix: "Voice AI answers rescheduling calls instantly, 24/7, with calendar-level slot selection — zero hold music." },
      { source: "Trustpilot", theme: "Payment disputes", quote: "Card charged twice for the same order. Support says 'wait 5-7 business days' with no reference number.", aiFix: "verify_payment_status flags duplicate settlements instantly and issues the reversal with a tracked reference." },
      { source: "App Store", theme: "Returns friction", quote: "Return portal says my order isn't eligible but never says why. Had to call to find out the window closed 2 days ago.", aiFix: "check_return_eligibility states the rule, the exact window, and books the pickup in one message." },
      { source: "Reddit", theme: "Order tracking", quote: "Tracking page says 'out for delivery' for four days. Nobody at support can see more than I can.", aiFix: "The agent reads live carrier events via get_order_status and explains the real delay reason plus a new ETA." },
    ],
    policies: [
      { topic: "Returns & refunds", snippet: "Returns are accepted within 15 days of delivery for unused items in original packaging. Refunds are issued to the original payment method within 5–7 business days of the return being scanned at the warehouse." },
      { topic: "Delivery & shipping", snippet: "Standard delivery takes 2–4 business days. Same-day delivery is available on eligible items in selected cities when ordered before 12pm. Delivery slots can be rescheduled free of charge up to 24 hours before dispatch." },
      { topic: "Warranty & damaged items", snippet: "Items damaged in transit are replaced free of charge if reported within 48 hours of delivery with a photo. Manufacturer warranty covers defects for 12 months from purchase date." },
      { topic: "Payments & pricing", snippet: "If a payment fails but the amount is debited, the bank auto-reverses the authorization within 5 business days. Vouchers cannot be combined and are valid for single use per account." },
      { topic: "Cancellations", snippet: "Orders can be cancelled free of charge before dispatch. After dispatch, the order can be refused at the door or returned, with standard return policy applying." },
    ],
    tools: [
      { name: "get_order_status", args: "order_id", returns: "status, eta, tracking_url, carrier_events[]" },
      { name: "check_return_eligibility", args: "order_id", returns: "eligible, window_ends, pickup_slots[]" },
      { name: "verify_payment_status", args: "payment_ref", returns: "settled, duplicate_charge, reversal_eta" },
    ],
  },
  logistics: {
    label: "Logistics & Courier",
    benchmarks: {
      monthlyVolume: 68000, ahtMinutes: 6.5, costPerAgentMonth: 580,
      aiCostPerResolution: 0.09, deflectionRate: 0.68, agentCapacity: 1300, fteHour: 4.2,
    },
    workflows: [
      { title: "Shipment Status & Proof of Delivery", intent: "Where is my shipment", pctVolume: 31, complexity: "API Tool-Call", channel: "WhatsApp", tool: { name: "check_shipment_status", args: "tracking_id", returns: "status, location, pod_url" } },
      { title: "Failed Delivery & Redelivery Booking", intent: "Missed my delivery", pctVolume: 14, complexity: "API Tool-Call", channel: "Voice", tool: { name: "book_redelivery", args: "tracking_id, date", returns: "confirmed_date, window" } },
      { title: "Customs Clearance & Duties", intent: "Package stuck in customs", pctVolume: 9, complexity: "RAG-Only", channel: "Voice" },
      { title: "Pickup Scheduling", intent: "Schedule a pickup", pctVolume: 9, complexity: "API Tool-Call", channel: "WhatsApp", tool: { name: "schedule_pickup", args: "address, date, parcel_count", returns: "pickup_id, time_window" } },
      { title: "Damaged or Lost Shipment Claims", intent: "Package is damaged", pctVolume: 7, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "Rate Card & Transit-Time Quotes", intent: "How much to ship to…", pctVolume: 7, complexity: "API Tool-Call", channel: "Web Chat", tool: { name: "get_rate_quote", args: "origin, destination, weight", returns: "price, transit_days" } },
      { title: "Address Corrections In Transit", intent: "Wrong address on label", pctVolume: 6, complexity: "API Tool-Call", channel: "Voice", tool: { name: "update_delivery_address", args: "tracking_id, address", returns: "updated, eta_impact" } },
      { title: "Business Account Invoicing", intent: "Question on my invoice", pctVolume: 6, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "Delivery Slot & Hold at Location", intent: "Hold my parcel", pctVolume: 6, complexity: "API Tool-Call", channel: "WhatsApp", tool: { name: "hold_at_location", args: "tracking_id, location_id", returns: "held_until" } },
      { title: "Dangerous Goods & Restricted Items", intent: "Can I ship this?", pctVolume: 5, complexity: "RAG-Only", channel: "Web Chat" },
    ],
    complaints: [
      { source: "Trustpilot", theme: "No visibility", quote: "Parcel 'in transit' for a week with zero updates. Chatbot gives the same tracking page I already checked.", aiFix: "The AI agent pulls live scan events via check_shipment_status and explains the actual exception — not a looping link." },
      { source: "App Store", theme: "Failed delivery", quote: "Driver came while I was at work, left no card, and now I have to call an IVR for 30 minutes to rearrange.", aiFix: "Voice AI books redelivery in under 60 seconds with slot choice, and WhatsApp confirms it in writing." },
      { source: "Reddit", theme: "Customs opaque", quote: "Shipment held in customs for 10 days. Nobody could tell me which document was missing or what duty was owed.", aiFix: "A grounded agent cites the exact customs policy, names the missing document, and calculates the duty due instantly." },
      { source: "Trustpilot", theme: "Claims slow", quote: "Filed a damage claim. Six weeks later, still 'under review' with no case number I can reference.", aiFix: "The agent opens the claim with photo upload over WhatsApp, issues a case ID, and proactively updates status." },
      { source: "App Store", theme: "Pickup UX", quote: "Scheduling a courier pickup requires calling during business hours only. Why is this not in the app?", aiFix: "WhatsApp-based schedule_pickup books same-day collection 24/7 with a live time window." },
      { source: "Reddit", theme: "Hold times", quote: "40 minutes on hold to change the delivery address. By the time an agent answered, the truck was already out.", aiFix: "Address corrections via Voice AI apply before route dispatch and confirm the ETA impact immediately." },
    ],
    policies: [
      { topic: "Tracking & visibility", snippet: "Every shipment is scanned at pickup, hub departure, hub arrival, out-for-delivery, and delivery. Proof of delivery (signature or photo) is available within 15 minutes of delivery." },
      { topic: "Failed delivery", snippet: "If delivery cannot be completed, a redelivery is attempted the next business day at no charge. After 3 failed attempts, the parcel is held at the nearest depot for 7 calendar days." },
      { topic: "Customs & duties", snippet: "International shipments may require a commercial invoice and HS codes. Duties are calculated on CIF value. Clearance typically takes 24–48 hours once all documents are on file." },
      { topic: "Claims", snippet: "Damage or loss claims must be filed within 14 days of delivery (or expected delivery). Claims are assessed within 10 business days and require photos of packaging and contents." },
      { topic: "Pickup & rates", snippet: "Pickups can be scheduled until 3pm for same-day collection. Rates are based on chargeable weight (volumetric vs. actual, whichever is greater) and fuel surcharge." },
    ],
    tools: [
      { name: "check_shipment_status", args: "tracking_id", returns: "status, location, eta, pod_url, exceptions[]" },
      { name: "book_redelivery", args: "tracking_id, date, slot", returns: "confirmed_date, window" },
      { name: "schedule_pickup", args: "address, date, parcel_count", returns: "pickup_id, time_window" },
    ],
  },
  telecom: {
    label: "Telecom & Connectivity",
    benchmarks: {
      monthlyVolume: 120000, ahtMinutes: 9, costPerAgentMonth: 640,
      aiCostPerResolution: 0.1, deflectionRate: 0.58, agentCapacity: 950, fteHour: 4.8,
    },
    workflows: [
      { title: "Billing Disputes & Explaining Charges", intent: "Why is my bill this high", pctVolume: 19, complexity: "API Tool-Call", channel: "Voice", tool: { name: "get_billing_breakdown", args: "account_no, month", returns: "line_items, usage_drivers" } },
      { title: "Data Balance & Top-ups", intent: "How much data do I have", pctVolume: 17, complexity: "API Tool-Call", channel: "WhatsApp", tool: { name: "get_data_balance", args: "msisdn", returns: "remaining, renewal_date" } },
      { title: "Outage & No-Service Diagnostics", intent: "My internet is down", pctVolume: 12, complexity: "API Tool-Call", channel: "Voice", tool: { name: "run_line_diagnostics", args: "account_no", returns: "status, fault_found, eta_fix" } },
      { title: "Plan Changes & Upgrades", intent: "Upgrade my plan", pctVolume: 11, complexity: "API Tool-Call", channel: "Web Chat", tool: { name: "change_plan", args: "account_no, plan_id", returns: "new_plan, effective_date" } },
      { title: "Contract, ECF & Early Termination", intent: "What does cancelling cost", pctVolume: 8, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "Device & Router Troubleshooting", intent: "Router lights are red", pctVolume: 8, complexity: "RAG-Only", channel: "WhatsApp" },
      { title: "SIM Replacement & eSIM Activation", intent: "Swap my SIM", pctVolume: 7, complexity: "API Tool-Call", channel: "Web Chat", tool: { name: "trigger_sim_swap", args: "msisdn, id_verified", returns: "swap_status" } },
      { title: "Roaming Packs & Rates", intent: "Roaming charges abroad", pctVolume: 7, complexity: "RAG-Only", channel: "WhatsApp" },
      { title: "Porting & Number Transfer", intent: "Keep my number", pctVolume: 6, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "Retention & Loyalty Offers", intent: "Thinking of switching", pctVolume: 5, complexity: "API Tool-Call", channel: "Voice", tool: { name: "get_retention_offers", args: "account_no", returns: "offers[], expiry" } },
    ],
    complaints: [
      { source: "Trustpilot", theme: "Billing shock", quote: "My bill doubled this month. Three calls, 1.5 hours total, still no explanation of what I'm paying for.", aiFix: "Voice AI reads the itemized breakdown via get_billing_breakdown and explains the usage drivers in plain language — one call, two minutes." },
      { source: "Reddit", theme: "Outage black hole", quote: "Fibre down for two days. Support just says 'we are aware'. No ETA, no compensation mention.", aiFix: "run_line_diagnostics confirms the fault, gives a restoration ETA, and auto-applies the outage credit per policy." },
      { source: "App Store", theme: "Data balance", quote: "App logs me out every week. Checking my data balance requires calling support. In 2025.", aiFix: "WhatsApp AI answers get_data_balance instantly — no app, no login loop, no queue." },
      { source: "Trustpilot", theme: "Retention maze", quote: "To cancel I had to call a specific line, wait 45 minutes, and listen to a retention pitch I'd already declined twice.", aiFix: "The agent handles cancellation requests with full policy citations and presents eligible offers once — respectfully and instantly." },
      { source: "Reddit", theme: "Plan confusion", quote: "Sales rep promised unlimited, contract says 'fair usage'. Support and sales blame each other.", aiFix: "Grounded RAG cites the exact fair-usage clause from the signed plan terms — one source of truth." },
      { source: "App Store", theme: "SIM swap pain", quote: "Lost my phone abroad. SIM replacement required a branch visit 40km away.", aiFix: "Identity-verified eSIM activation via Web Chat restores service in minutes, anywhere." },
    ],
    policies: [
      { topic: "Billing cycles & charges", snippet: "Bills are issued on the 1st of each month for the prior cycle. Pro-rata charges apply for mid-cycle plan changes. Itemized usage is available for calls, data, and premium services." },
      { topic: "Outage compensation", snippet: "For confirmed service outages exceeding 4 hours, customers receive an automatic credit pro-rated to their monthly plan value. Credits appear on the next bill — no claim needed." },
      { topic: "Fair usage", snippet: "Unlimited plans include 1TB of full-speed data per month, after which speeds are throttled to 5 Mbps until the next cycle. Tethering is included; resale is not." },
      { topic: "Early cancellation", snippet: "Early cancellation fees equal 50% of the remaining contract value, capped at 3 months. Cancellation requires 30 days' written notice via the retention desk." },
      { topic: "Roaming", snippet: "Roaming packs activate on first use abroad and auto-renew while abroad. Pay-as-you-go rates outside a pack range from 0.35 to 1.20 per unit depending on zone." },
    ],
    tools: [
      { name: "get_billing_breakdown", args: "account_no, month", returns: "line_items[], usage_drivers, disputes_window" },
      { name: "run_line_diagnostics", args: "account_no", returns: "line_status, fault_found, eta_fix, credit_applied" },
      { name: "get_data_balance", args: "msisdn", returns: "remaining_gb, throttled, renewal_date" },
    ],
  },
  finance: {
    label: "Banking & Financial Services",
    benchmarks: {
      monthlyVolume: 85000, ahtMinutes: 8, costPerAgentMonth: 750,
      aiCostPerResolution: 0.12, deflectionRate: 0.55, agentCapacity: 1000, fteHour: 5.6,
    },
    workflows: [
      { title: "Card Blocking & Replacement", intent: "My card was stolen", pctVolume: 15, complexity: "API Tool-Call", channel: "Voice", tool: { name: "block_card", args: "card_last4, reason", returns: "blocked, replacement_eta" } },
      { title: "Transaction Disputes & Fraud Claims", intent: "I didn't make this payment", pctVolume: 14, complexity: "API Tool-Call", channel: "Voice", tool: { name: "open_dispute", args: "txn_id, category", returns: "case_id, provisional_credit" } },
      { title: "Balance, Statements & IBAN Confirmations", intent: "Send me my statement", pctVolume: 13, complexity: "API Tool-Call", channel: "WhatsApp", tool: { name: "get_statement", args: "account_no, period", returns: "pdf_url" } },
      { title: "Loan & Credit Eligibility", intent: "What loans can I get", pctVolume: 10, complexity: "API Tool-Call", channel: "Web Chat", tool: { name: "check_preapproval", args: "customer_id", returns: "offers[], max_amount" } },
      { title: "KYC & Document Requirements", intent: "What documents do you need", pctVolume: 9, complexity: "RAG-Only", channel: "WhatsApp" },
      { title: "Branch & Appointment Booking", intent: "Book a branch visit", pctVolume: 8, complexity: "API Tool-Call", channel: "WhatsApp", tool: { name: "book_appointment", args: "branch_id, service, time", returns: "confirmation_code" } },
      { title: "Fees, Rates & Charges Explained", intent: "What is the transfer fee", pctVolume: 8, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "Account Opening Status", intent: "Is my account open yet", pctVolume: 7, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "International Transfers & SWIFT", intent: "Where is my transfer", pctVolume: 6, complexity: "API Tool-Call", channel: "Voice", tool: { name: "trace_transfer", args: "swift_ref", returns: "status, correspondent, eta" } },
      { title: "Product Terms & Compliance Questions", intent: "Is my deposit protected", pctVolume: 10, complexity: "RAG-Only", channel: "Web Chat" },
    ],
    complaints: [
      { source: "Trustpilot", theme: "Fraud response", quote: "Reported a fraudulent transaction and was on hold 35 minutes. Card stayed active the whole time.", aiFix: "Voice AI blocks the card in seconds via block_card, opens the dispute with a case ID, and confirms provisional credit by policy." },
      { source: "Reddit", theme: "Disputes opaque", quote: "Dispute filed 8 weeks ago. Every call: 'it's in process'. No case number, no timeline.", aiFix: "The agent issues a tracked case ID at open_dispute time and proactively updates status over WhatsApp." },
      { source: "App Store", theme: "Statements", quote: "Can't download statements older than 3 months from the app. Branch told me to use the app.", aiFix: "get_statement delivers any period's signed PDF on WhatsApp within seconds." },
      { source: "Trustpilot", theme: "Branch friction", quote: "Had to take half a day off to sign one form at a branch. Appointment system is a phone tree.", aiFix: "WhatsApp book_appointment offers exact slots with the right specialist — no phone tree, no wasted leave." },
      { source: "Reddit", theme: "Fees unclear", quote: "Charged an 'international processing fee' nobody mentioned when I opened the account.", aiFix: "Grounded RAG quotes the exact fee schedule and amount before the transfer is made." },
      { source: "App Store", theme: "Transfer tracing", quote: "SWIFT transfer missing for 9 days. Bank says contact the receiving bank; they say the opposite.", aiFix: "trace_transfer follows the payment through correspondents and gives a real ETA with the current holding bank." },
    ],
    policies: [
      { topic: "Card security", snippet: "Lost or stolen cards are blocked immediately upon report and a replacement is dispatched within 3–5 business days. Fraudulent transactions reported within 24 hours are fully reimbursed." },
      { topic: "Disputes", snippet: "Transaction disputes must be raised within 60 days of the statement date. A case ID is issued at filing; provisional credit may apply within 10 business days pending investigation." },
      { topic: "Deposit protection", snippet: "Eligible deposits are protected up to the equivalent of 100,000 under the national deposit protection scheme, per depositor per bank." },
      { topic: "Fees & rates", snippet: "The schedule of charges applies to all accounts: international transfers, ATM withdrawals abroad, and account maintenance fees are itemized in the published fee schedule, updated quarterly." },
      { topic: "KYC requirements", snippet: "Account opening requires passport/Emirates ID, proof of address dated within 90 days, and, for residents, a salary certificate or trade license. Verification completes within 2 business days." },
    ],
    tools: [
      { name: "block_card", args: "card_last4, reason", returns: "blocked, replacement_eta" },
      { name: "open_dispute", args: "txn_id, category", returns: "case_id, provisional_credit_date" },
      { name: "trace_transfer", args: "swift_ref", returns: "status, correspondent_bank, eta" },
    ],
  },
  travel: {
    label: "Travel & Airlines",
    benchmarks: {
      monthlyVolume: 55000, ahtMinutes: 8.5, costPerAgentMonth: 600,
      aiCostPerResolution: 0.1, deflectionRate: 0.6, agentCapacity: 1050, fteHour: 4.6,
    },
    workflows: [
      { title: "Flight Rebooking & Schedule Changes", intent: "My flight changed", pctVolume: 22, complexity: "API Tool-Call", channel: "Voice", tool: { name: "get_rebooking_options", args: "pnr", returns: "options[], fare_diff" } },
      { title: "Refund Eligibility & Processing", intent: "Flight cancelled, want refund", pctVolume: 15, complexity: "API Tool-Call", channel: "Web Chat", tool: { name: "check_refund_eligibility", args: "pnr", returns: "eligible, amount, method" } },
      { title: "Baggage Delay, Damage & Claims", intent: "My bag didn't arrive", pctVolume: 11, complexity: "API Tool-Call", channel: "WhatsApp", tool: { name: "trace_baggage", args: "tag_no", returns: "last_scan, status, claim_id" } },
      { title: "Check-in & Seat Issues", intent: "Can't check in", pctVolume: 9, complexity: "RAG-Only", channel: "WhatsApp" },
      { title: "Visa, Transit & Travel Documents", intent: "Do I need a visa", pctVolume: 8, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "Loyalty Points & Tier Benefits", intent: "Where are my miles", pctVolume: 8, complexity: "API Tool-Call", channel: "WhatsApp", tool: { name: "get_loyalty_balance", args: "member_id", returns: "points, tier, expiry" } },
      { title: "Special Assistance & Medical Requests", intent: "Wheelchair assistance", pctVolume: 7, complexity: "RAG-Only", channel: "Voice" },
      { title: "Hotel & Package Amendments", intent: "Change my hotel dates", pctVolume: 7, complexity: "API Tool-Call", channel: "Web Chat", tool: { name: "amend_booking", args: "booking_ref, new_dates", returns: "price_diff, confirmed" } },
      { title: "Compensation & Delay Claims", intent: "2 hour delay, what am I owed", pctVolume: 7, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "Group Bookings & Corporate Accounts", intent: "Booking for 12 people", pctVolume: 6, complexity: "RAG-Only", channel: "Web Chat" },
    ],
    complaints: [
      { source: "Trustpilot", theme: "Rebooking hold times", quote: "40-minute hold times for flight rebooking after they cancelled my flight. Then the agent offered worse connections than online.", aiFix: "Voice AI presents equivalent rebooking options instantly via get_rebooking_options — no hold, no downgrade roulette." },
      { source: "App Store", theme: "Refunds crawl", quote: "Cancelled by the airline, refund promised in 7 days, took 9 weeks and a chargeback to resolve.", aiFix: "check_refund_eligibility confirms the amount and method immediately, with the refund triggered in the same session." },
      { source: "Reddit", theme: "Baggage black hole", quote: "Bag lost 6 days. The 'tracker' still shows the origin airport. Nobody answers the baggage line.", aiFix: "trace_baggage reports the real last scan and opens the claim with compensation eligibility cited over WhatsApp." },
      { source: "Trustpilot", theme: "Compensation denied", quote: "3-hour delay, entitled to compensation under the policy. Web form rejected it twice with no reason.", aiFix: "The agent cites the exact delay-compensation clause and files the claim in-chat with the policy attached." },
      { source: "App Store", theme: "Check-in fails", quote: "Check-in fails with 'see agent at airport'. Airport queue: 90 minutes.", aiFix: "Grounded diagnostics explain the exact block (visa, name, seat fee) before the passenger leaves home." },
      { source: "Reddit", theme: "Loyalty support", quote: "Miles from my codeshare flight never posted. Phone queue for the loyalty desk is a weekend affair.", aiFix: "get_loyalty_balance reconciles missing partner flights and auto-claims within policy — instantly." },
    ],
    policies: [
      { topic: "Rebooking & schedule changes", snippet: "When a flight is cancelled or rescheduled by more than 3 hours, passengers may rebook on the next available service at no fare difference, or request a full refund within 24 months." },
      { topic: "Refunds", snippet: "Refund eligibility follows the fare rules of the ticket. Airline-initiated cancellations are fully refundable regardless of fare class. Refunds are processed to the original payment method within 7 business days of approval." },
      { topic: "Baggage", snippet: "Delayed baggage must be reported at the airport or within 21 days of arrival. Checked baggage liability is capped per applicable convention. Essentials may be claimed up to 50 per day of delay with receipts." },
      { topic: "Delay compensation", snippet: "Delays over 3 hours at departure entitle passengers to meals and, where regulation applies, monetary compensation unless caused by extraordinary circumstances (weather, ATC)." },
      { topic: "Loyalty", snippet: "Partner flight miles post within 14 days. Missing miles can be claimed within 6 months of the flight date with the boarding pass and ticket number." },
    ],
    tools: [
      { name: "get_rebooking_options", args: "pnr", returns: "options[], fare_diff, seats_available" },
      { name: "check_refund_eligibility", args: "pnr", returns: "eligible, amount, method, eta" },
      { name: "trace_baggage", args: "tag_no", returns: "last_scan, status, claim_id" },
    ],
  },
  healthcare: {
    label: "Healthcare & Clinics",
    benchmarks: {
      monthlyVolume: 30000, ahtMinutes: 7, costPerAgentMonth: 560,
      aiCostPerResolution: 0.1, deflectionRate: 0.63, agentCapacity: 1150, fteHour: 4.4,
    },
    workflows: [
      { title: "Appointment Booking & Rescheduling", intent: "Book a doctor visit", pctVolume: 28, complexity: "API Tool-Call", channel: "WhatsApp", tool: { name: "book_appointment", args: "specialty, doctor_id, date", returns: "slot, confirmation_code" } },
      { title: "Clinic Hours, Location & Directions", intent: "Are you open now", pctVolume: 14, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "Insurance Coverage & Pre-approval", intent: "Is this covered", pctVolume: 12, complexity: "API Tool-Call", channel: "Voice", tool: { name: "verify_policy_coverage", args: "policy_no, service_code", returns: "covered, co_pay, preauth_required" } },
      { title: "Test Results Availability", intent: "Are my results ready", pctVolume: 9, complexity: "RAG-Only", channel: "WhatsApp" },
      { title: "Prescription Refill Requests", intent: "Refill my prescription", pctVolume: 8, complexity: "API Tool-Call", channel: "WhatsApp", tool: { name: "request_refill", args: "patient_id, prescription_id", returns: "status, pickup_eta" } },
      { title: "Billing & Statement Questions", intent: "Why was I charged this", pctVolume: 7, complexity: "RAG-Only", channel: "Voice" },
      { title: "Teleconsultation Setup", intent: "How does video visit work", pctVolume: 6, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "Vaccination & Screening Schedules", intent: "When is my next dose", pctVolume: 6, complexity: "RAG-Only", channel: "WhatsApp" },
      { title: "Referral Coordination", intent: "Need a specialist referral", pctVolume: 5, complexity: "API Tool-Call", channel: "Web Chat", tool: { name: "create_referral", args: "patient_id, specialty", returns: "referral_id, eligible_clinics[]" } },
      { title: "Patient Records & Portal Access", intent: "Can't log into portal", pctVolume: 5, complexity: "RAG-Only", channel: "Web Chat" },
    ],
    complaints: [
      { source: "Trustpilot", theme: "Phone-line gridlock", quote: "Called 23 times at 8am to get an appointment. Lines open and instantly engaged.", aiFix: "WhatsApp AI books directly into the practice calendar 24/7 — no 8am scramble, no queue." },
      { source: "App Store", theme: "Insurance limbo", quote: "Nobody can tell me if my procedure is covered until I show up. Then a surprise bill.", aiFix: "verify_policy_coverage answers coverage and co-pay before the visit, with the policy number cited." },
      { source: "Reddit", theme: "Results chasing", quote: "Told 'we'll call if something's wrong'. Called them twice; results were ready a week earlier.", aiFix: "The agent pushes result availability notifications and explains next steps per protocol — no chasing." },
      { source: "Trustpilot", theme: "Rescheduling pain", quote: "Rescheduling an appointment means calling during work hours and waiting on hold.", aiFix: "Self-service reschedule via WhatsApp with live slot availability in two taps." },
      { source: "App Store", theme: "Refill loops", quote: "Prescription refill request form online is broken; phone line says use the form.", aiFix: "request_refill routes to the clinician queue with status tracking over WhatsApp — no dead-end forms." },
      { source: "Reddit", theme: "Billing opacity", quote: "Two visits, same treatment, different charges. Billing office only answers Tuesdays.", aiFix: "Grounded RAG explains the charge breakdown against the published fee schedule immediately." },
    ],
    policies: [
      { topic: "Appointments", snippet: "Appointments can be booked, rescheduled, or cancelled up to 12 hours before the slot at no charge. Late cancellations may incur a fee. Same-day slots are released at 7am daily." },
      { topic: "Insurance & coverage", snippet: "Coverage depends on the patient's plan schedule of benefits. Pre-approval is required for procedures above the defined threshold; the clinic's insurance desk submits pre-auth within 1 business day." },
      { topic: "Test results", snippet: "Routine results are available in the patient portal within 48 hours. Abnormal results are always communicated by the treating clinician first, followed by portal release." },
      { topic: "Prescriptions", snippet: "Repeat prescriptions require review every 6 months. Refill requests are processed within 2 business days; controlled medications require in-person review." },
      { topic: "Billing", snippet: "Consultation, procedure, and consumable charges follow the published fee schedule. Insurance adjudication appears on the statement within 30 days of the visit; disputes can be raised within 90 days." },
    ],
    tools: [
      { name: "book_appointment", args: "specialty, doctor_id, date", returns: "slot, confirmation_code" },
      { name: "verify_policy_coverage", args: "policy_no, service_code", returns: "covered, co_pay, preauth_required" },
      { name: "request_refill", args: "patient_id, prescription_id", returns: "status, pickup_eta" },
    ],
  },
  saas: {
    label: "SaaS & Technology",
    benchmarks: {
      monthlyVolume: 18000, ahtMinutes: 9.5, costPerAgentMonth: 720,
      aiCostPerResolution: 0.13, deflectionRate: 0.52, agentCapacity: 900, fteHour: 5.4,
    },
    workflows: [
      { title: "Account & Access Troubleshooting", intent: "Can't log in / SSO broken", pctVolume: 20, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "Billing, Invoices & Plan Changes", intent: "Update my card / invoice copy", pctVolume: 15, complexity: "API Tool-Call", channel: "Web Chat", tool: { name: "get_invoice", args: "account_id, period", returns: "pdf_url, status" } },
      { title: "Feature How-tos & Best Practices", intent: "How do I do X", pctVolume: 14, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "Integration & API Support", intent: "Webhook not firing", pctVolume: 11, complexity: "API Tool-Call", channel: "WhatsApp", tool: { name: "check_integration_health", args: "account_id, integration", returns: "status, last_error, retry" } },
      { title: "Data Export, Migration & Backups", intent: "Export my data", pctVolume: 9, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "Security, Privacy & Compliance Questions", intent: "Are you SOC2 compliant", pctVolume: 8, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "Trial Extension & Upgrade Path", intent: "Extend my trial", pctVolume: 7, complexity: "API Tool-Call", channel: "WhatsApp", tool: { name: "apply_trial_extension", args: "account_id, days", returns: "new_expiry" } },
      { title: "Incident Status & Updates", intent: "Is there an outage", pctVolume: 7, complexity: "API Tool-Call", channel: "Voice", tool: { name: "get_incident_status", args: "region", returns: "active_incidents, eta" } },
      { title: "Onboarding & Setup Guidance", intent: "First-time setup help", pctVolume: 5, complexity: "RAG-Only", channel: "Voice" },
      { title: "Feature Requests & Roadmap Signals", intent: "Can you build X", pctVolume: 4, complexity: "RAG-Only", channel: "Web Chat" },
    ],
    complaints: [
      { source: "Trustpilot", theme: "Support tiers", quote: "Paying customer but support replies take 48 hours. The chatbot only links docs.", aiFix: "A grounded agent resolves access, billing, and how-to intents end-to-end — reserving humans for real escalations." },
      { source: "Reddit", theme: "Billing opaque", quote: "Invoice doesn't match my plan. Opened a ticket; answer came after my card was charged again.", aiFix: "get_invoice plus grounded plan-terms RAG reconcile the charge instantly, before renewal." },
      { source: "App Store", theme: "SSO lockouts", quote: "SSO login loop every Monday. Support resets it manually each time.", aiFix: "Diagnostics-guided troubleshooting resolves the SAML metadata issue on first contact." },
      { source: "Trustpilot", theme: "Docs vs reality", quote: "The docs describe a feature that the product doesn't have anymore. Wasted a day integrating it.", aiFix: "RAG is indexed on current release docs, so the agent never cites deprecated behavior — and flags doc drift." },
      { source: "Reddit", theme: "Status silence", quote: "System down for 3 hours, status page said 'all systems operational' the whole time.", aiFix: "get_incident_status gives real-time state and ETA in-chat, with proactive outage notifications." },
      { source: "App Store", theme: "Trial traps", quote: "Card charged right after my trial 'ended' — a week before I expected it.", aiFix: "The agent states the exact trial expiry, applies extensions within policy, and reminds before conversion." },
    ],
    policies: [
      { topic: "Billing & plans", snippet: "Subscriptions renew automatically at the end of each billing period. Upgrades are pro-rated immediately; downgrades take effect next cycle. Invoices for any period can be downloaded from the billing portal." },
      { topic: "Trials", snippet: "Trials run for 14 days from signup. Card-on-file accounts convert automatically unless cancelled 24 hours before expiry. One extension of up to 14 days may be granted per account." },
      { topic: "Security & compliance", snippet: "The platform maintains SOC 2 Type II and ISO 27001 certifications. Data is encrypted at rest and in transit. Sub-processors are listed in the trust center." },
      { topic: "Support SLAs", snippet: "Response targets: critical incidents 1 hour, high 4 business hours, standard 1 business day. Uptime commitment is 99.9% monthly, with service credits per the published schedule." },
      { topic: "Account access", snippet: "SSO and 2FA resets require verification of the account admin. Workspace owners manage member roles; individual users cannot elevate their own permissions." },
    ],
    tools: [
      { name: "get_invoice", args: "account_id, period", returns: "pdf_url, status, line_items" },
      { name: "check_integration_health", args: "account_id, integration", returns: "status, last_error, last_success" },
      { name: "apply_trial_extension", args: "account_id, days", returns: "new_expiry, eligible" },
    ],
  },
  utilities: {
    label: "Utilities & Government Services",
    benchmarks: {
      monthlyVolume: 95000, ahtMinutes: 7.5, costPerAgentMonth: 540,
      aiCostPerResolution: 0.09, deflectionRate: 0.65, agentCapacity: 1200, fteHour: 4.1,
    },
    workflows: [
      { title: "Bill Queries & Payment Arrangements", intent: "My bill looks wrong", pctVolume: 21, complexity: "API Tool-Call", channel: "WhatsApp", tool: { name: "get_bill_breakdown", args: "account_no, period", returns: "charges[], usage_graph" } },
      { title: "Meter Reading Submission & Checks", intent: "Submit meter reading", pctVolume: 15, complexity: "API Tool-Call", channel: "WhatsApp", tool: { name: "submit_meter_reading", args: "account_no, reading", returns: "accepted, next_billing" } },
      { title: "Outage & Service Interruption Updates", intent: "Is there a power cut", pctVolume: 13, complexity: "API Tool-Call", channel: "Voice", tool: { name: "check_outage_status", args: "area_code", returns: "affected, eta_restore" } },
      { title: "New Connection & Move In/Out", intent: "Move service to new address", pctVolume: 10, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "Payment Plans & Hardship Support", intent: "Can I split my bill", pctVolume: 8, complexity: "API Tool-Call", channel: "Voice", tool: { name: "arrange_payment_plan", args: "account_no, months", returns: "plan_id, installment" } },
      { title: "Document & Permit Applications", intent: "How do I apply for…", pctVolume: 8, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "Appointment & Inspection Booking", intent: "Book a meter inspection", pctVolume: 7, complexity: "API Tool-Call", channel: "WhatsApp", tool: { name: "book_appointment", args: "service, date", returns: "slot, reference" } },
      { title: "Tariff Plans & Rate Explanations", intent: "What tariff am I on", pctVolume: 7, complexity: "RAG-Only", channel: "Web Chat" },
      { title: "Complaint Registration & Tracking", intent: "I want to complain", pctVolume: 6, complexity: "API Tool-Call", channel: "Voice", tool: { name: "register_complaint", args: "account_no, category", returns: "complaint_id, sla_days" } },
      { title: "Energy/Water Saving Advice", intent: "Why is my usage high", pctVolume: 5, complexity: "RAG-Only", channel: "WhatsApp" },
    ],
    complaints: [
      { source: "Trustpilot", theme: "Bill shock", quote: "Bill tripled with no explanation. Call centre can only 'raise a ticket'.", aiFix: "get_bill_breakdown explains the usage drivers with the actual graph on WhatsApp — no ticket needed." },
      { source: "Reddit", theme: "Outage silence", quote: "Power out 6 hours. Helpline IVR says 'check the website'; the website says 'check the helpline'.", aiFix: "Voice AI reports affected areas and restoration ETA from live outage data, with proactive SMS updates." },
      { source: "App Store", theme: "Payment friction", quote: "Can't pay by card online, and the payment office closes at 2pm.", aiFix: "The agent takes payments and sets up payment plans 24/7 over WhatsApp with instant receipts." },
      { source: "Trustpilot", theme: "Move-in maze", quote: "Transferring service to a new flat took 5 calls and a branch visit. Nobody mentioned the clearance certificate.", aiFix: "Grounded RAG lists the exact documents and books the connection slot in one conversation." },
      { source: "Reddit", theme: "Hardship ignored", quote: "Asked for a payment plan, told to 'email documents', heard nothing for a month while late fees piled up.", aiFix: "arrange_payment_plan screens eligibility and confirms installments immediately — no document limbo." },
      { source: "App Store", theme: "Meter disputes", quote: "Disputed a reading, was told an inspector would come 'within 6 weeks'.", aiFix: "book_appointment offers real inspection slots and the agent explains estimated-read adjustments on the spot." },
    ],
    policies: [
      { topic: "Billing", snippet: "Bills are issued monthly based on meter readings or estimates. Estimated reads are trued up on the next actual read. Payment is due within 14 days of issue; late fees apply after 21 days." },
      { topic: "Outages", snippet: "Planned interruptions are notified 48 hours in advance. Unplanned outages are restored per priority tiers, with live status and ETA published to the status feed and helpline." },
      { topic: "Payment plans", snippet: "Customers with arrears may arrange installment plans of up to 6 months. Hardship customers may qualify for extended terms and fee waivers upon income verification." },
      { topic: "Connections & moves", snippet: "Move-in requires tenancy documents and a clearance certificate from the previous occupant. Connections are activated within 2 business days of a complete application." },
      { topic: "Complaints", snippet: "Complaints receive a reference number at registration and a substantive response within 10 business days. Escalation to the regulatory authority is available after this window." },
    ],
    tools: [
      { name: "get_bill_breakdown", args: "account_no, period", returns: "charges[], usage_graph, due_date" },
      { name: "check_outage_status", args: "area_code", returns: "affected, eta_restore, planned[]" },
      { name: "arrange_payment_plan", args: "account_no, months", returns: "plan_id, installment, start_date" },
    ],
  },
};

export function resolveIndustry(domain: string, tagline: string | null): IndustryProfile {
  const text = `${domain} ${tagline ?? ""}`.toLowerCase();
  const has = (...words: string[]) => words.some((w) => text.includes(w));

  if (has("bank", "invest", "capital", "finance", "insur", "pay", "money", "wealth", "credit")) return PROFILES.finance;
  if (has("airlin", "travel", "flight", "tour", "trip", "vacation", "hotel", "holiday", "fly", "airways")) return PROFILES.travel;
  if (has("courier", "cargo", "ship", "freight", "logistic", "delivery", "transport", "express", "movers")) return PROFILES.logistics;
  if (has("telecom", "telecom", "fiber", "fibre", "mobile", "network", "connect", "wifi", "broadband", "airtel", "Etisalat")) return PROFILES.telecom;
  if (has("clinic", "health", "medical", "hospital", "dental", "care", "pharma", "doctor", "therapy")) return PROFILES.healthcare;
  if (has("shop", "store", "market", "buy", "mall", "cart", "retail", "fashion", "deals", "bazaar")) return PROFILES.ecommerce;
  if (has("software", "saas", "app", "cloud", "tech", "ai", "data", "dev", "platform", "systems", "labs", "digital")) return PROFILES.saas;
  if (has("energy", "water", "power", "utility", "electric", "gas", "municipal", "gov", "authority")) return PROFILES.utilities;
  return PROFILES.ecommerce;
}

export { PROFILES };

export function industryLabel(key: string): string {
  return PROFILES[key]?.label ?? key;
}
