# Project ko test kaise karein

Ye guide batati hai ki app kaise chalana hai aur har module ko step by step kaise test karna hai.

> **Abhi kya nahi bana:** Login, team invitations aur roles. App abhi bina login ke chalta hai.

## 1. App start karo

**Pehli baar setup** (project ke main folder se):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cd frontend && npm install && cd ..
```

**Har baar chalane ke liye, do alag terminal kholo:**

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

Browser mein kholo: http://localhost:3000

> **Dhyan rakho:** Settings page ke **Clear all projects** aur **Restore sample data** buttons tumhara banaya hua data delete kar dete hain.

## 2. Automatic tests

```bash
source .venv/bin/activate
cd backend
python -m pytest -q
```

Sab tests pass hone chahiye. Ye temporary database use karte hain, tumhara data nahi chhedte. Ye sirf backend check karte hain; screens tumhe neeche ke steps se haath se test karni hain.

## 3. Poora workflow test karo

Ek naya project banao aur neeche ke steps isi order mein karo, kyunki aage ke modules pichhle modules ka data use karte hain.

### Step 1: Requirements

1. **Requirements** kholo aur 2-3 requirements add karo.
2. Har requirement ko validate karo, phir approve karo.

**Expected:** code `REQ-001`, `REQ-002` aise bante hain aur status Approved ho jata hai.

### Step 2: Business Analysis

Current state, future state, objectives, ek gap aur ek stakeholder add karo.

**Expected:** refresh karne ke baad bhi data dikhta hai.

### Step 3: BRD / FRD

1. Ek BRD aur ek FRD generate karo.
2. Dono ko submit for review karo, phir approve karo.

**Expected:** requirements aur analysis ka data documents mein apne aap aa jata hai.

### Step 4: User Stories

Story banao, use requirement se link karo, acceptance criteria likho aur 5 story points do. Story points sirf 1, 2, 3, 5, 8, 13 ya 21 ho sakte hain.

### Step 5: Solution Design

1. Overview aur build approach likho.
2. Ek component add karo aur use requirement se link karo.

### Step 6: Estimation & Pricing

Is example ko use karo, taaki total match kar sako:

1. **Team & rates** mein do roles add karo: Developer (day rate 500) aur QA (day rate 300).
2. **Effort** mein item add karo: role Developer, days 2 / 4 / 12.
3. Dusra item add karo: role QA, phase Test, days 5 / 5 / 5.
4. **Pricing** mein contingency 10% aur discount 5% rakho, phir save karo.

| Check | Expected |
|---|---|
| Developer item | 5 expected days, cost 2,500 |
| QA item | 5 expected days, cost 1,500 |
| Subtotal | 4,000 |
| Contingency | 400 |
| Discount | 220 |
| **Total price** | **4,180** |
| Minimum duration | 1 week |

Phir **From user stories** dabao aur naye item ko ek role assign karo. 5 points wali story ke liye days 3.75 / 5 / 7.5 aane chahiye. Is button se total badal jayega, isliye upar ka table isse pehle check karna.

**Galat input bhi try karo:** optimistic 5 aur most likely 1 daalne par error aana chahiye.

### Step 7: Proposals

1. **New proposal** dabao.
2. Check karo ki scope, solution, team aur price apne aap bhar gaye.
3. Edit karke save karo, review ke liye submit karo aur approve karo.
4. **PDF** download karke kholo.

### Step 8: Presentations

**New presentation** banao, phir **PowerPoint** aur **PDF** download karke kholo.

**Expected:** har section ki slide banti hai. 7 se zyada points hon to "(continued)" slide banti hai.

### Step 9: Traceability

**Expected:** jo requirement poori linked hai usme "Missing" nahi dikhta. Bina story, design ya estimate wali requirement mein "Missing" dikhta hai.

1. **Incomplete** tab par click karo.
2. **View impact** kholo aur linked items aur cost dekho.
3. **CSV** download karo.

### Step 10: Templates

1. Sidebar se **Templates** kholo aur **New template** banao.
2. Ek section mein apna text likho aur ek section khaali chhodo.
3. Kisi project mein naya document banate waqt ye template chuno.

**Expected:** likha hua text waisa hi rehta hai aur khaali standard section project ke data se bhar jata hai.

Document editor mein **Save as template** bhi try karo.

### Step 11: Delivery Handoff

1. Delivery lead, start date aur notes save karo.
2. **Download package** se zip lo.
3. Saare Required checks Done hone par **Mark as handed off** dabao.

**Expected:** Required checks poore hone se pehle button disabled rehta hai. Zip mein documents, backlog, solution design, estimate aur traceability file hoti hai.

## 4. Optional features

| Feature | Kya chahiye |
|---|---|
| **Draft with AI** aur baaki AI buttons | `backend/.env` mein `LLM_PROVIDER` aur `LLM_API_KEY`, aur us provider ka SDK install. Details: `backend/README.md` |
| Meeting recording | Microphone ka access |

## 5. Pata hai, ye limit hai

- PDF mein Hindi jaisi non-Latin language ka text sahi print nahi hota.
- Estimation mein abhi "Draft with AI" button nahi hai.

## 6. Bug mile to kya note karein

- Kis screen par aaya
- Kya click kiya
- Kya hona chahiye tha aur kya hua
- Browser Console (F12) ya backend terminal ka error
