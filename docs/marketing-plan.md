# Solutionwhere — Marketing Strategy & Tactics (built on Graphed CLI)

## Company snapshot
- Product: cloud platform for education agencies with four modules — PD (Wisdomwhere), Enrollments, Coaching, Referrals.
- Buyers: school districts, ISDs/RESAs/ESCs/BOCES/AEAs/IUs, state education agencies, universities, adult ed, early-childhood networks.
- Proof: since 1996, 33+ states, "80% less time on PD registration admin."
- Position: "Four things education agencies do every year. One platform that does them."
- Weakness: no pricing, no self-serve, demo-only CTA, thin online presence.

## Strategy (3 bets)
1. **Own the intermediate-agency niche.** ~1,500 regional service agencies in the US (ESCs, BOCES, RESAs, ISDs). Small, nameable, reachable. Win the category on search and outbound before targeting districts.
2. **Land with PD, expand to the other three.** PD registration is the sharpest pain with a proof point. Sell PD, cross-sell Enrollments/Coaching/Referrals inside the first renewal.
3. **Run marketing as deployed agents, not headcount.** Every tactic below is a Graphed project (`graphed init` → `graphed deploy`) with a cron job, a Postgres table, and a dashboard. One operator supervises.

## Tactics

### 1. SEO agent (Graphed `seo` plugin)
- `graphed plugins add seo --apply-manifest`; connect to the site's CMS.
- Keyword queue by module × agency type: "PD registration software for ESCs", "school choice lottery software", "instructional coaching log software", "child care referral tracking".
- Comparison pages vs. Frontline, PowerSchool PD, KickUp, SchoolMint, TalentEd.
- Weekly cron: 3 drafts → human review → publish. Track rankings via GSC source in the warehouse.

### 2. Outbound agent (ICP list + sequences)
- Build the agency database: scrape state ESC/BOCES directories + LinkedIn (Graphed Tools `apify:*linkedin*`), enrich, verify, load to Postgres.
- Titles: Director of Professional Learning, Enrollment/Student Services Director, Coaching Coordinator, Early Childhood Director.
- Trigger-based sends: new PD coordinator hired, state PD-credit rule changes, lottery season (Jan–Mar), fiscal year budget windows (Apr–Jun).
- Job: nightly cron to pull new LinkedIn job changes and enqueue leads to the email tool.

### 3. Conference and association coverage
- Priority: Learning Forward, AESA (Assoc. of Educational Service Agencies), NAEYC, state ESC associations.
- Agent: scrape attendee/speaker lists per event, match to CRM, queue pre-event outreach 3 weeks out and post-event follow-up 48 hours after.

### 4. Case-study engine
- Warehouse job pulls product usage per customer (registrations processed, hours saved). Flag accounts at >80% time-savings; queue a case-study ask.
- Target: 1 named case study per module per quarter. Publish via SEO plugin.

### 5. Referral and expansion motion
- Monthly cron: customers using 1 module → email with usage stats + the adjacent module's ROI. "You processed 4,200 PD registrations. Enrollments season starts in 60 days."
- Peer referral: ESCs talk to each other. Offer a "bring your neighbor agency" incentive.

### 6. Website fixes (one-time)
- Publish a pricing page (even "starts at" per module). Public-sector buyers need it for RFPs.
- Add a self-serve sandbox or recorded demo. Cut the phone number as the primary CTA.
- Put the "80% less time" stat above the fold with the customer's name.

## Dashboard (Graphed)
One deployed dashboard: pipeline by agency type, organic traffic by module page, outbound reply rate, module attach rate, case studies shipped. Reviewed weekly.

## 90-day sequence
- Days 1–30: ICP database built, SEO plugin live, pricing page up, dashboard deployed.
- Days 31–60: outbound live to ESCs/BOCES, 10 comparison pages published, first case study.
- Days 61–90: expansion emails live, AESA/Learning Forward outreach, review attach rate and reply rate; cut what is under target.

## Targets
| Metric | 90-day |
|---|---|
| Qualified demos/month | 20 |
| Organic sessions to module pages | 2× baseline |
| Outbound reply rate | 5% |
| Module attach (customers on 2+) | +10 pts |
