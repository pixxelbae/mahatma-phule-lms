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

**Teacher** — creates courses and splits each one into topics. Notes (typed
text and/or an attached file) and MCQ quizzes (four options, marks per
question) are uploaded under a topic. Each course has three tabs:

- *Topics & content* — topics with their notes and quizzes, and who has
  attempted each quiz.
- *Session log* — after each class, record the date, topics covered, what was
  taught, and attendance.
- *Students* — every student's attendance, quiz progress, topics completed and
  average score. Attendance below 75% is marked in red.

**Student** — the dashboard shows progress and attendance for each course. A
course page lists notes and quizzes topic by topic, with a progress bar and a
Completed / In progress / Not started status per topic. Progress goes up as
quizzes are attempted; a topic is complete once all its quizzes are done. Each
quiz can be attempted once, and the score and correct answers are shown right
after submitting. The *My attendance* tab shows the attendance percentage and
a present/absent history of every session.

## Files

- `server.js` — HTTP server and API
- `public/` — the pages (login, dashboard, course, quiz, manage, accounts)
- `data.json` — all data; delete it to start over with the three accounts above
- `uploads/` — files attached to notes
