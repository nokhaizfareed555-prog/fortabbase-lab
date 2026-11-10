# Admin panel blueprint (every business)

Owner's standing rule, 10 Nov 2026. Every admin panel built for any of the owner's businesses (Fort Abbas Poly Clinic, Divaar.pk, Minzu Crafts and any new one) must have everything on this list, adapted to that business's niche. Do not wait to be reminded. If a session cannot build an item, it says so and lists it under "Not built yet" in the project's build-status doc.

How to use in a new Claude account: attach this file and say "Build the admin panel for <business, niche, domain> following this blueprint. Ask me only for things you cannot decide yourself."

Reference build: Fort Abbas Poly Clinic (fortabbaspolyclinic.com/admin, repo nokhaizfareed555-prog/fortabbase-lab). When unsure how something should look or behave, copy how it works there.

---

## 1. Ground rules for every panel

- Stack: static site on Vercel, Supabase for login, database, storage and Edge Functions. Public site pages are server-rendered for SEO.
- Roles: owner, admin, staff (user). Every section and page has its own permission key; owners have everything. Owner accounts are protected and cannot be removed by others.
- Everything is a draft until Save. Unsaved changes survive a reload ("Restore unsaved changes?"). Each section has Save, Discard changes and Set section to default.
- Every change is written to an Audit log (who, what, when).
- Preview mode: the admin and site run with sample data when the Supabase address is blank, so every screen can be tested without touching live data.
- Keys and passwords (AI keys, email passwords, other projects' service keys) are stored server-side in tables no browser can read, and are never shown again after saving.
- Script and stylesheet links carry a ?v= version; bump it on every change so phones do not keep stale files.
- Before publishing: fetch and merge main, push, create the production deployment, then list deployments to confirm yours is the latest (several sessions may publish).
- Each feature gets a short project doc (what it does, where the code is, settings keys, what was tested, what is waiting on the owner).
- Test at desktop (1440, 1280) and phone (390, 360, 320) widths: no sideways scroll, nothing clipped, no console errors.
- Respect reduced motion. Slow phones and connections get a "lite" mode (no heavy blur or animation).
- Language: English plus the local language (Urdu for Pakistan) with a language button, right-to-left layout and a font that suits it.

## 2. Admin shell and navigation

- Sidebar grouped as Work, Look, Sections, Setup, with icons; selected item in green glass. On phones the sidebar is a slide-in menu.
- Sections open from one Sections button as two rows of short tabs above the content; the open tab widens to its full name.
- Top bar: **admin panel switcher** (see 3), breadcrumb, search across every setting, item and how-to (Ctrl/Cmd+K), View site, account avatar.
- Admin helper chat bubble (bottom right, signed-in staff only): answers how to use the admin with exact paths and numbered clicks, and gives live counts. Read only, daily message limit, no customer records sent to the AI.
- Toast messages for every save and error. Confirmation dialogs for anything destructive.
- Separate favicons for site and admin.
- The admin uses the same button design and animation as the public site (Look > Buttons, glass buttons, hover effect, touch press, click ripple).
- Look > Admin buttons: "Same as the website" by default; "Own look" starts with the Website look style (identical to the site) and lets every detail be tweaked on top (corners, height, text size, weight, border, shadow, hover, text colors, tint, glare, embossed edges, selected sidebar and tab colors), plus Solid, Outline, Soft and Frosted styles for a completely different look.
- Notifications page with a bell and count in the top bar for every staff member: things waiting for an owner's confirmation (Approve, Decline with a note, Cancel by the requester) and personal news. Any change that affects everyone goes through it.
- Views and Arrange admin: built-in views (Front desk, Comprehensive, a niche view), each person's own arrangement, a default view per person, and **Apply for everyone** (owners apply at once, admins need an owner's approval; everyone's own arrangement is kept so they can switch back). Only owners and admins rearrange; everyone can choose a view.
- Dashboard with Needs attention and one card per area, each opening a hub with its own tabs.

## 3. Admin panel switcher and single sign-in (like GoHighLevel sub-accounts)

- Top-left switcher on every admin page, shortcut Ctrl+Shift+P. Private to the main owner (the business owner's own account), not to every owner; the main owner grants or removes access per person on the Admin panels page. Granted people sign in to other panels with their own email only; only the main owner adds panels, saves keys or changes access. Shows the current panel with a tick, then every other panel with its letter mark or logo, a short line, "One click" or "Sign in there", and an open-in-new-tab button. Search box when there are more than four. "Manage admin panels" at the bottom.
- Setup > Admin panels: add, edit, reorder, hide, remove panels. Fields: name, short line, letters, colour, logo, admin address, Supabase project address, service key, "Sign in as" email.
- One-click sign-in: an Edge Function checks the signed-in owner, uses the other project's service key (server-side only) to create a one-time magic link for the same email, and the browser lands on that admin already signed in. Every switch goes in the Audit log.
- One-time setup per panel: paste its secret/service key; add its admin address to that project's Authentication > URL Configuration > Redirect URLs; have an admin account there with the same email.
- Every panel must list all the other panels, so switching works from any of them.

## 4. Look (design controls)

- **Name and logo**: brand name, logo, site favicon, admin favicon (cropped to the artwork automatically).
- **Colors and fonts**: base and highlight colours, font picker for headings and text, local-language font. Randomize button on every design section.
- **Effects**: click ripple (rings, colours, blur, duration), glass buttons, background mesh and patterns, frost strength.
- **Buttons**: separate Desktop and Phone settings with a switch and Copy from the other; style (same as site, solid, outline, soft tint), colours, automatic or chosen text colour, border, shadow, text size, weight, height, side space, corners (all buttons or per area), hover and touch effect with second effect, amount, speed, direction, motion style and colour; placement rules for hero, panels, forms and dialogs. Live preview at the chosen device size.
- **Hover animation**: per widget type (cards, people, rows, questions) with lift, slide, grow, tilt, glow, outline, wash, shine, image zoom, float, pulse.
- **Glass background colors** and **section background** colour controls, with randomize.
- **Mobile and desktop**: separate settings and separate previews for phone and desktop: columns per section, which sections show, image crop/zoom/position/brightness per view, template choices.
- **Phone top and bottom bars**: title size, menu, cart icon with count, bottom bar buttons (Call, WhatsApp, Book or Buy), language button corner, confirmation before changing language.
- **Picture design**: every uploaded picture can be cropped, zoomed, moved, brightened and shaped per device; default pictures when a person or item has no photo.
- Surprise me / Randomize on design sections, never repeating the previous choice, nothing live until Save.

## 5. Sections (home page and pages)

- **Section rearranger**: show, hide and reorder every home section, separately for phone and desktop if wanted.
- Each section has its own editor with a live preview that keeps its scroll position while editing.
- Hero with several images and two call-to-action buttons; registrations/trust badges; at-a-glance stats; services; team/staff; catalogue highlights; gallery; questions (FAQ); latest blog articles; visit/contact with map, phone, hours, email; footer.
- **Team cards**: glass cards that flip to show details, Lead badge, availability badge from weekly times, qualifications, titles, photo controls, default pictures by gender.
- **View all** button on each section, styled to match that section's widgets, each switchable.
- **Footer editor**: columns, links (add, remove, reorder), contact overrides, copyright, optional drawn skyline of local landmarks.
- **National and religious events banner** (for Pakistan businesses): countdowns, Islamic dates with moon-sighting override, ayah strip when no event, separate phone style, page switches, scrolling text.
- Signature animated sections are allowed (DNA helix, vials, product showcases) but must have a lite/reduced-motion still version and stop when off screen.

## 6. Work (daily business tools)

- **Bookings or Orders**: list with one-click filters and counts, search across every field, status, type, date range, sort; change date, status, cancel; walk-ins; who booked for whom.
- **Customers or Patients**: records, logins for the customer portal, password reset, family/relations where relevant.
- **Catalogue**: items with prices (show/hide per item and site-wide), categories, packages/bundles built in the admin, master switches per group, board view, Surprise me ordering.
- **Cart and checkout**: cart icon with count, side panel, checkout page sharing one form, optional email with unticked consent.
- **Documents for customers** (lab reports, invoices, certificates, quotes): editor with live A4 preview, several designs, per-document design, PDF download, approval step, customer portal download.
- **Conversations** (inspired by GoHighLevel): the business mailbox inside the admin; Inbox, Unread, Starred, Assigned to me, Sent, All, Archived, Spam, Trash; chat bubbles by day, docked reply box (Reply, Reply all, Forward, Team note); contact panel with assignment, labels, their orders/bookings, files, stats; attachments; safe HTML view with pictures blocked until asked. WhatsApp and SMS channels where the business uses them.
- **Messages**: bulk email Compose, Templates with an Email design panel (layouts, colours, font, logo, button, Surprise me, computer/phone preview), Contacts, Sent log, Email setup (business mailbox over SMTP, or Resend).
- **Loyalty**: points per completed order, badges with thresholds, manual adjust with reason, trophy room and rewards map for the customer, consent-only emails.
- **Visitors and SEO**: visits, people, pages, sources (Google, Maps, social, WhatsApp, AI assistants, tagged links), devices, campaigns, latest visits, search landing pages, sitemap page check. Staff and bots not counted.
- **Blog articles**: list, edit, publish, translations.

## 7. Blog agent (every panel, adapted to the niche)

- Team of agents: Topic Scout, Planner, Source Researcher, Writer, SEO and Linker, Image Curator, Quality Reviewer, Publisher, Translator, Refresher, Performance Monitor. Runs on a schedule (pg_cron + Edge Function).
- Settings: on/off, auto-publish, manual approval, articles per week, time of day, model, monthly AI call limit, languages, trusted sources, categories, notify email.
- Niche rules: sources and safety rules fit the business (medical: MedlinePlus, WHO, CDC, NIH, no dose or stop-medicine advice, waits for a person on safety concerns; shop: product care, buying guides, no false claims; food: recipes and hygiene; and so on).
- Quality score from fact-check minus deductions; citations numbered to the Sources list; near-duplicates and low scores wait for a person.
- Photos: high-resolution, three shapes (wide, card, square), licence-checked, never reused across articles; Pexels key optional.
- Public blog: article pages, categories, search, RSS feed, editorial standards page, local-language blog, latest articles section on the home page.
- Search Console and email alerts hooks.

## 8. Setup

- **Users**: staff accounts, roles, per-section permissions, protected owners, forced password change on first sign-in.
- **Audit log**.
- **Daily check**: morning check of overdue orders, missing details, ready-but-empty documents, empty content, missing images, pages not loading; email to the owner only when something is wrong, with a correction button for each problem.
- **Live optimization**: speed diagnostic, suggested fixes with Apply and Undo (image rebuilds, speed settings).
- **Labs**: private area to try new sections before they go live, each marked Live or Draft.
- **Languages**: default language, language button, translations.
- **Admin panels** (see 3).
- Email setup, AI keys, integrations.

## 9. Public site essentials (built with every panel)

- Separate server-rendered pages per area with unique titles, canonicals, structured data; sitemap.xml, robots.txt, llms.txt; noindex on private pages; Search Console verification file kept.
- Breadcrumb path on every page (tappable pills on phones), phone menu, cart icon, bottom action bar on phones.
- Customer portal (reports, orders, loyalty) behind phone/ID login.
- Visitor tracking without names, phones or IP addresses.

## 10. Adapting to the niche

| Blueprint item | Clinic / lab | Shop (Divaar, Minzu) | Restaurant / cafe | Salon / services | School / academy |
|---|---|---|---|---|---|
| Catalogue | Tests and panels | Products, options, stock | Menu items, deals | Services, packages | Courses, classes |
| Bookings or Orders | Lab bookings, home collection | Orders, shipping, payments | Table bookings, delivery orders | Appointments by staff | Admissions, enrolments |
| Customer documents | Lab reports (PDF) | Invoices, receipts | Bills | Receipts, gift cards | Results, certificates |
| Team cards | Doctors, staff | Makers, support | Chefs | Stylists | Teachers |
| Blog sources | MedlinePlus, WHO, CDC, NIH | Care guides, makers' notes | Food safety, recipes | Beauty and hair care | Education boards |
| Loyalty | Points per visit | Points per order, coupons | Stamps per meal | Points per visit | Attendance rewards |

## 11. Ready-to-paste request for the Divaar.pk and Minzu Crafts sessions

"Following the owner's admin panel blueprint (section 3), replace this admin's simple project switcher with the full one: list Fort Abbas Poly Clinic (admin https://fortabbaspolyclinic.com/admin, Supabase https://mdndkrpyrcgrpytdtiim.supabase.co), Divaar.pk (https://www.divaar.pk/admin, https://anhkpwimjupewgahyawc.supabase.co) and Minzu Crafts (https://minzucrafts.com/admin, https://mygwidnbepwcbxnrjvzs.supabase.co), owners only, with a Setup page to add more panels and one-click sign-in through an Edge Function that uses the other project's saved service key to create a magic link for the same email. Copy the design and code from web/assets/panels.js, panels.css, functions/panel-pass and db/015_admin_panels.sql in nokhaizfareed555-prog/fortabbase-lab. Also add this admin's address to this project's Supabase Authentication > URL Configuration > Redirect URLs."

---

## Fort Abbas status against this blueprint (10 Nov 2026)

Built: everything in sections 2 to 9, except the items below.
Not built yet: WhatsApp and SMS inside Conversations; individual pages per doctor or test; separate Urdu web addresses for Google; automatic booking and report emails; one-click sign-in keys for Divaar and Minzu (owner to paste); Divaar and Minzu switchers do not list Fort Abbas yet (their repositories were not reachable from this session); the blog admin page (/admin/blog) keeps its own button style.
