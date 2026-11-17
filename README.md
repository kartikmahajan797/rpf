# How to test the project

This guide explains how to run the app and test each module step by step.

> **Not built yet:** Login, team invitations, and roles. The app currently works without login.

## 1. Start the app

**First-time setup** (from the project root folder):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cd frontend && npm install && cd ..
```

**To run it each time, open two separate terminals:**

Terminal 1 (backend):

```bash
source .venv/bin/activate
cd backend
uvicorn app.main:app --reload --port 8000
```

Terminal 2 (frontend):

```bash
cd frontend
npm run dev
```

Open this in the browser: http://localhost:3000

> **Important:** The **Clear all projects** and **Restore sample data** buttons on the Settings page will delete the data you created.

## 2. Automated tests

```bash
source .venv/bin/activate
cd backend
python -m pytest -q
```

All tests should pass. These use a temporary database, so they do not affect your data. They only check the backend; the screens below must be tested manually.

## 3. Test the full workflow

Create a new project and follow the steps below in this order, because later modules use data from earlier ones.

### Step 1: Requirements

1. Open **Requirements** and add 2-3 requirements.
2. Validate each requirement, then approve it.

**Expected:** codes such as `REQ-001`, `REQ-002` are created and the status becomes Approved.

### Step 2: Business Analysis

Add the current state, future state, objectives, one gap, and one stakeholder.

**Expected:** the data remains visible even after refresh.

### Step 3: BRD / FRD

1. Generate one BRD and one FRD.
2. Submit both for review, then approve them.

**Expected:** the requirements and analysis data are automatically populated in the documents.

### Step 4: User Stories

Create a story, link it to a requirement, write acceptance criteria, and assign 5 story points. Story points can only be 1, 2, 3, 5, 8, 13, or 21.

### Step 5: Solution Design

1. Write the overview and build approach.
2. Add one component and link it to a requirement.

### Step 6: Estimation & Pricing

Use this example to make sure the total matches:

1. In **Team & rates**, add two roles: Developer (day rate 500) and QA (day rate 300).
2. In **Effort**, add one item with role Developer and days 2 / 4 / 12.
3. Add another item with role QA, phase Test, and days 5 / 5 / 5.
4. In **Pricing**, set contingency to 10% and discount to 5%, then save.

| Check | Expected |
|---|---|
| Developer item | 5 expected days, cost 2,500 |
| QA item | 5 expected days, cost 1,500 |
| Subtotal | 4,000 |
| Contingency | 400 |
| Discount | 220 |
| **Total price** | **4,180** |
| Minimum duration | 1 week |

Then click **From user stories** and assign a role to the new item. For a 5-point story, the values should be 3.75 / 5 / 7.5. This button changes the total, so check the table above before doing this.

**Also try invalid input:** if you enter optimistic = 5 and most likely = 1, an error should appear.

### Step 7: Proposals

1. Click **New proposal**.
2. Check that scope, solution, team, and price are auto-filled.
3. Edit and save it, then submit it for review and approve it.
4. Download and open the **PDF**.

### Step 8: Presentations

Create a **New presentation**, then download both the **PowerPoint** and **PDF** and open them.

**Expected:** each section creates a slide. If there are more than 7 points, a "(continued)" slide is created.

### Step 9: Traceability

**Expected:** requirements that are fully linked should not show "Missing". Requirements without a story, design, or estimate should show "Missing".

1. Click the **Incomplete** tab.
2. Open **View impact** and review the linked items and cost.
3. Download the **CSV**.

### Step 10: Templates

1. Open **Templates** from the sidebar and create a **New template**.
2. Write text in one section and leave another section blank.
3. When creating a new document in a project, choose this template.

**Expected:** the written content remains as-is, while the blank standard section is filled with project data.

Also try **Save as template** in the document editor.

### Step 11: Delivery Handoff

1. Save the delivery lead, start date, and notes.
2. Download the zip using **Download package**.
3. Once all required checks are marked Done, click **Mark as handed off**.

**Expected:** the button remains disabled until all required checks are complete. The zip contains the documents, backlog, solution design, estimate, and traceability files.

## 4. Optional features

| Feature | Requirement |
|---|---|
| **Draft with AI** and other AI buttons | Set `LLM_PROVIDER` and `LLM_API_KEY` in `backend/.env`, and install the SDK for that provider. Details: `backend/README.md` |
| Meeting recording | Microphone access |

## 5. Known limitations

- PDF export does not correctly print non-Latin text such as Hindi.
- Estimation does not yet include a "Draft with AI" button.

## 6. What to note when you find a bug

- Which screen it happened on
- What you clicked
- What was expected and what actually happened
- The browser console error (F12) or backend terminal error
