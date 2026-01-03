// ------------------ PROJECT CONSTANTS ------------------

export const DIVISIONS = [
  "All",
  "Network Communications",
  "Oil Mining & Goverments",
  "IT Solutions",
] as const;

export const STATUSES = [
  "Carry Over",
  "Prospect",
  "New Prospect",
] as const;

export const PROJECT_TYPES = [
  "Project Based",
  "Recurring",
  "New Recurring",
] as const;

export const SALES_STAGES = [
  { value: 1, label: "1 - Prospecting" },
  { value: 2, label: "2 - Qualification" },
  { value: 3, label: "3 - Presales Analysis" },
  { value: 4, label: "4 - Quotation" },
  { value: 5, label: "5 - Negotiation" },
  { value: 6, label: "6 - Closing" },
];

export const SPH_STATUSES = ["Open", "Hold", "Drop", "Win", "Loss"] as const;


// ------------------ SALES STAGE PROBABILITY (optional) ------------------
// Used later for weighted revenue forecast
export const SALES_STAGE_PROBABILITY: Record<number, number> = {
  1: 0.10, // Prospecting
  2: 0.20, // Qualification
  3: 0.40, // Presales Analysis
  4: 0.60, // Quotation  
  5: 0.80, // Negotiation
  6: 1.00, // Closing
};


export const STAGES = [
  { no: 1, title: "Order Confirmation & Planning" },
  { no: 2, title: "Procurement & Delivery Execution" },
  { no: 3, title: "Implementation" },
  { no: 4, title: "Goods Receipt / Service Acceptance" },
  { no: 5, title: "Invoice Submission" },
] as const;