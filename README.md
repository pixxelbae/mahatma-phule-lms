# Mahatma Phule LMS

A small learning management site for a coaching institute. Plain Node.js, no
dependencies and no build step.

## Running it

```
node server.js
```

Then open http://localhost:3000

## Logins

The office (admin) creates every account; there is no sign-up page.

| Role    | Email                   | Password   |
| ------- | ----------------------- | ---------- |
| Admin   | admin@institute.com     | admin123   |
| Teacher | teacher@institute.com   | teacher123 |
| Student | student@institute.com   | student123 |

## What each role can do

**Admin** — creates teacher and student accounts (name, email, password) and
hands the login details to them. Accounts can also be removed.

**Teacher** — creates courses, adds or removes students by their email address,
uploads notes (typed text and/or an attached file) and writes MCQ quizzes with
four options and marks per question. Student scores appear under each quiz.

**Student** — sees their courses on the dashboard, opens a course to read or
download its notes, and attempts each quiz once. The score and the correct
answers are shown right after submitting.

## Files

- `server.js` — HTTP server and API
- `public/` — the pages (login, dashboard, course, quiz, manage, accounts)
- `data.json` — all data; delete it to start over with the three accounts above
- `uploads/` — files attached to notes
