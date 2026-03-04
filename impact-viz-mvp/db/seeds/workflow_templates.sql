-- Seed Data: Built-in Workflow Templates
-- Purpose: Standard workflow templates for grant management
-- These templates are system-wide and available to all organizations

-- ============================================================================
-- STANDARD DUE DILIGENCE CHECKLIST
-- Comprehensive pre-grant due diligence workflow
-- ============================================================================

INSERT INTO public.workflow_templates (
  id,
  organization_id,
  name,
  workflow_type,
  description,
  is_system,
  is_active,
  steps
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  NULL,
  'Standard Due Diligence',
  'due_diligence',
  'Comprehensive pre-grant due diligence checklist for evaluating prospective grantees',
  true,
  true,
  '[
    {
      "id": "verify_501c3",
      "name": "Verify 501(c)(3) Status",
      "description": "Confirm tax-exempt status via IRS determination letter or ProPublica lookup. Check IRS Select Check database.",
      "required": true,
      "estimated_days": 1,
      "order": 1
    },
    {
      "id": "check_ein",
      "name": "Verify EIN",
      "description": "Confirm EIN matches IRS records and organization name",
      "required": true,
      "estimated_days": 1,
      "order": 2
    },
    {
      "id": "review_990",
      "name": "Review Latest 990",
      "description": "Review most recent Form 990 for financial health indicators, executive compensation, program expenses, and governance practices",
      "required": true,
      "estimated_days": 2,
      "order": 3
    },
    {
      "id": "check_ratings",
      "name": "Check Charity Ratings",
      "description": "Review Charity Navigator, Candid/GuideStar, and other rating sources for accountability and transparency scores",
      "required": false,
      "estimated_days": 1,
      "order": 4
    },
    {
      "id": "review_financials",
      "name": "Financial Review",
      "description": "Review audited financials, program expense ratio, overhead costs, and financial sustainability indicators",
      "required": true,
      "estimated_days": 3,
      "order": 5
    },
    {
      "id": "mission_alignment",
      "name": "Assess Mission Alignment",
      "description": "Evaluate alignment with foundation priorities, theory of change, and strategic focus areas",
      "required": true,
      "estimated_days": 2,
      "order": 6
    },
    {
      "id": "capacity_assessment",
      "name": "Capacity Assessment",
      "description": "Evaluate organizational capacity to execute proposed work, including staffing, infrastructure, and track record",
      "required": true,
      "estimated_days": 2,
      "order": 7
    },
    {
      "id": "leadership_review",
      "name": "Leadership & Governance Review",
      "description": "Review board composition, leadership stability, governance practices, and conflict of interest policies",
      "required": true,
      "estimated_days": 2,
      "order": 8
    },
    {
      "id": "reference_checks",
      "name": "Reference Checks",
      "description": "Contact previous funders or partners for references on program quality and organizational reliability",
      "required": false,
      "estimated_days": 3,
      "order": 9
    },
    {
      "id": "site_visit",
      "name": "Site Visit (if applicable)",
      "description": "Conduct virtual or in-person site visit to observe programs and meet leadership team",
      "required": false,
      "estimated_days": 5,
      "order": 10
    },
    {
      "id": "final_recommendation",
      "name": "Final Recommendation",
      "description": "Compile findings and prepare recommendation memo with funding decision rationale",
      "required": true,
      "estimated_days": 2,
      "order": 11
    }
  ]'::JSONB
);

-- ============================================================================
-- QUARTERLY GRANT REVIEW
-- Grant monitoring and quarterly check-in workflow
-- ============================================================================

INSERT INTO public.workflow_templates (
  id,
  organization_id,
  name,
  workflow_type,
  description,
  is_system,
  is_active,
  steps
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  NULL,
  'Quarterly Grant Review',
  'grant_monitoring',
  'Quarterly check-in and progress review for active grants',
  true,
  true,
  '[
    {
      "id": "review_report",
      "name": "Review Progress Report",
      "description": "Review grantee submitted progress report for completeness and accuracy",
      "required": true,
      "estimated_days": 2,
      "order": 1
    },
    {
      "id": "verify_metrics",
      "name": "Verify Reported Metrics",
      "description": "Cross-check reported metrics against targets and previous periods",
      "required": true,
      "estimated_days": 1,
      "order": 2
    },
    {
      "id": "financial_check",
      "name": "Financial Status Check",
      "description": "Review budget expenditures vs plan, burn rate, and remaining funds",
      "required": true,
      "estimated_days": 1,
      "order": 3
    },
    {
      "id": "milestone_review",
      "name": "Milestone Progress Review",
      "description": "Assess progress on upcoming milestones and identify any delays or blockers",
      "required": true,
      "estimated_days": 1,
      "order": 4
    },
    {
      "id": "grantee_call",
      "name": "Grantee Check-in Call",
      "description": "Schedule and conduct check-in call with grantee to discuss progress and challenges",
      "required": false,
      "estimated_days": 3,
      "order": 5
    },
    {
      "id": "risk_assessment",
      "name": "Risk Assessment Update",
      "description": "Update risk assessment based on current performance and external factors",
      "required": true,
      "estimated_days": 1,
      "order": 6
    },
    {
      "id": "document_review",
      "name": "Document in System",
      "description": "Update grant record with review findings and next steps",
      "required": true,
      "estimated_days": 1,
      "order": 7
    }
  ]'::JSONB
);

-- ============================================================================
-- GRANT CLOSEOUT
-- End-of-grant closeout process
-- ============================================================================

INSERT INTO public.workflow_templates (
  id,
  organization_id,
  name,
  workflow_type,
  description,
  is_system,
  is_active,
  steps
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  NULL,
  'Grant Closeout',
  'closeout',
  'End-of-grant closeout process for completing and archiving grants',
  true,
  true,
  '[
    {
      "id": "final_report",
      "name": "Collect Final Report",
      "description": "Ensure final narrative and financial reports are submitted and complete",
      "required": true,
      "estimated_days": 5,
      "order": 1
    },
    {
      "id": "financial_reconciliation",
      "name": "Financial Reconciliation",
      "description": "Reconcile all payments and expenditures, verify proper use of funds",
      "required": true,
      "estimated_days": 3,
      "order": 2
    },
    {
      "id": "outcome_assessment",
      "name": "Outcome Assessment",
      "description": "Evaluate achievement of stated outcomes and goals against original proposal",
      "required": true,
      "estimated_days": 3,
      "order": 3
    },
    {
      "id": "lessons_learned",
      "name": "Document Lessons Learned",
      "description": "Capture key learnings for future grantmaking decisions",
      "required": false,
      "estimated_days": 2,
      "order": 4
    },
    {
      "id": "grantee_feedback",
      "name": "Collect Grantee Feedback",
      "description": "Gather feedback on the grant experience and foundation relationship",
      "required": false,
      "estimated_days": 2,
      "order": 5
    },
    {
      "id": "archive_documents",
      "name": "Archive Grant Documents",
      "description": "Ensure all documents are properly archived and accessible",
      "required": true,
      "estimated_days": 1,
      "order": 6
    },
    {
      "id": "renewal_decision",
      "name": "Renewal Decision",
      "description": "Determine if grant should be renewed or relationship continued in other form",
      "required": true,
      "estimated_days": 2,
      "order": 7
    }
  ]'::JSONB
);

-- ============================================================================
-- RENEWAL REVIEW
-- Grant renewal evaluation workflow
-- ============================================================================

INSERT INTO public.workflow_templates (
  id,
  organization_id,
  name,
  workflow_type,
  description,
  is_system,
  is_active,
  steps
) VALUES (
  '44444444-4444-4444-4444-444444444444',
  NULL,
  'Renewal Review',
  'renewal_review',
  'Evaluation workflow for grant renewal decisions',
  true,
  true,
  '[
    {
      "id": "review_history",
      "name": "Review Grant History",
      "description": "Review complete grant history including all reports, communications, and outcomes",
      "required": true,
      "estimated_days": 2,
      "order": 1
    },
    {
      "id": "assess_performance",
      "name": "Assess Performance",
      "description": "Evaluate overall grant performance against original goals and milestones",
      "required": true,
      "estimated_days": 2,
      "order": 2
    },
    {
      "id": "strategic_fit",
      "name": "Evaluate Strategic Fit",
      "description": "Assess continued alignment with foundation strategic priorities",
      "required": true,
      "estimated_days": 1,
      "order": 3
    },
    {
      "id": "organizational_health",
      "name": "Update Organizational Assessment",
      "description": "Review current organizational health including leadership, finances, and capacity",
      "required": true,
      "estimated_days": 2,
      "order": 4
    },
    {
      "id": "renewal_terms",
      "name": "Draft Renewal Terms",
      "description": "If proceeding, draft proposed renewal terms including amount and duration",
      "required": false,
      "estimated_days": 2,
      "order": 5
    },
    {
      "id": "decision_memo",
      "name": "Prepare Decision Memo",
      "description": "Prepare renewal decision memo with recommendation for leadership review",
      "required": true,
      "estimated_days": 2,
      "order": 6
    }
  ]'::JSONB
);

-- ============================================================================
-- SITE VISIT
-- Site visit planning and execution workflow
-- ============================================================================

INSERT INTO public.workflow_templates (
  id,
  organization_id,
  name,
  workflow_type,
  description,
  is_system,
  is_active,
  steps
) VALUES (
  '55555555-5555-5555-5555-555555555555',
  NULL,
  'Site Visit',
  'site_visit',
  'Planning and conducting grantee site visits',
  true,
  true,
  '[
    {
      "id": "schedule_visit",
      "name": "Schedule Visit",
      "description": "Coordinate with grantee to schedule visit date, attendees, and agenda",
      "required": true,
      "estimated_days": 5,
      "order": 1
    },
    {
      "id": "prepare_materials",
      "name": "Prepare Visit Materials",
      "description": "Review grant files and prepare questions and topics to cover",
      "required": true,
      "estimated_days": 2,
      "order": 2
    },
    {
      "id": "conduct_visit",
      "name": "Conduct Site Visit",
      "description": "Complete in-person or virtual site visit with grantee team",
      "required": true,
      "estimated_days": 1,
      "order": 3
    },
    {
      "id": "debrief",
      "name": "Internal Debrief",
      "description": "Debrief with internal team on visit observations and findings",
      "required": true,
      "estimated_days": 1,
      "order": 4
    },
    {
      "id": "document_findings",
      "name": "Document Findings",
      "description": "Write up site visit report with key observations and recommendations",
      "required": true,
      "estimated_days": 2,
      "order": 5
    },
    {
      "id": "follow_up",
      "name": "Follow-up Actions",
      "description": "Complete any follow-up items identified during visit",
      "required": false,
      "estimated_days": 5,
      "order": 6
    }
  ]'::JSONB
);

-- Verify insertion
-- SELECT name, workflow_type, jsonb_array_length(steps) as step_count FROM public.workflow_templates WHERE is_system = true;
