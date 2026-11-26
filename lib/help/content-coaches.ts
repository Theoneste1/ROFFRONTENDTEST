/** Help for Coaches and Head Coaches (Coach and Head Coach user guides, 2026-11-25, and the marking redesign of 2026-11-26). */
import type { HelpTopic, RoleGuide } from "./types";
import { discussion, forgotPassword, notifications, openWebsite, otherProfile, phoneMenu, profile, settings, signIn } from "./content-shared";

const coachDashboard: HelpTopic = {
  id: "coach-dashboard", paths: ["/mentor/dashboard"], title: "Dashboard",
  summary: "What is happening in your courses: work to review, assignments and your marking.",
  steps: ["Open what needs you first from its box.", "Use the menu on the left for everything else."],
  tips: ["A menu item appears only when you hold its permission. If one disappears, your Head Coach or an Administrator changed your access."],
};

const courses: HelpTopic = {
  id: "coach-courses", paths: ["/mentor/courses"], title: "Courses",
  summary: "The courses and divisions you were given access to, with their resources.",
  steps: [
    "Choose the course and the division.",
    "Open the tab Books, Past Papers or Notes & Materials.",
    "To add a resource, click Upload a Book, Upload Past Paper or Upload Material; fill in the Title, type and files.",
    "Tick Publish now if students should see it at once, then click Upload.",
  ],
  tips: ["Each resource has a menu to download, edit, publish or unpublish, and archive it.", "No course here? Ask your Head Coach for course access."],
};

const assignments: HelpTopic = {
  id: "coach-assignments", paths: ["/mentor/assignments"], title: "Assignments",
  summary: "Practice work for your students: create it, send it for approval and follow it.",
  steps: [
    "Click Create Assignment.",
    "Fill in the title, a short description and the instructions, then click Next.",
    "Add the problem sheet or other files if you have them.",
    "Set the course, division, deadline and maximum score.",
    "Check the summary, then Save as draft or Submit for approval.",
  ],
  tips: ["An Administrator approves and publishes it; students are then notified.", "Open an assignment card for its details, history and Review Submissions."],
};

const reviews: HelpTopic = {
  id: "coach-reviews", paths: ["/mentor/reviews", "/mentor/assignments/*/assignmentReview"], title: "Reviews",
  summary: "Students' assignment work waiting for your mark and feedback.",
  steps: [
    "Filter by Course or Status, then click Review on a card.",
    "Click Start Review (or Resume Review if it was sent back).",
    "Enter the Score (a whole number) and write Coach Feedback; attach feedback files if useful.",
    "Click Save Mark to keep working, then send the review when you are sure.",
  ],
  tips: ["If the assignment allows it, click Return for Revision to ask for a new attempt, with what to change.", "The student sees the feedback once the result is published."],
};

const marking: HelpTopic = {
  id: "coach-marking", paths: ["/mentor/marking"], title: "Marking",
  summary: "Test papers given to you to mark. Marking is blind: you see a paper code, never the student's name or school.",
  steps: [
    "Choose Show: To mark (your choice is remembered). Marked and All show the rest.",
    "Open a paper by its code. The answer is on the left, the marks on the right.",
    "For each question, enter the marks and a comment if useful; add an Overall comment if you want. The total updates as you type.",
    "Click Save draft whenever you want; you can come back later.",
    "When every question has marks, click Submit and confirm. The paper goes for approval.",
  ],
  tips: [
    "A paper \"Returned to you\" shows \"Returned for correction\" with the reviewer's reason at the top: correct it and submit again.",
    "If the page says the paper changed in another tab, reload it before you continue.",
    "Something not working? Contact your Head Coach or technical support.",
  ],
};

const questionMarking: HelpTopic = {
  id: "coach-question-marking", paths: ["/mentor/marking/q"], title: "Marking one question",
  summary: "On question-marked tests you mark one question of a paper at a time. You see the whole paper, and you are told which question to mark.",
  steps: [
    "In Questions to mark, click Start marking. The question is held for you while you work.",
    "Read the whole paper; mark only the question shown (\"You are marking Question 2 of 5\").",
    "Enter the marks for this question and a comment if useful. Click Save draft to keep your work.",
    "Click Submit this question. It leaves your list unless it is returned to you.",
    "If you cannot finish, click Give back so another coach can take it.",
  ],
  tips: ["A question you hold is given back automatically after a while without activity.", "If your access to the subject changes, the question is taken away at once and your draft is kept for the Head Coach."],
};

const coachStudents: HelpTopic = {
  id: "coach-students", paths: ["/mentor/students"], title: "Students",
  summary: "Every student of your programmes, at every level. Contact details are not shown.",
  steps: ["Search by name or username; filter by level.", "Click a name to open the student's profile."],
  tips: ["On a student's profile you can change their Olympiad level, with a reason."],
};

const coachResults: HelpTopic = {
  id: "coach-results", paths: ["/mentor/results"], title: "Results",
  summary: "Published test results of the students of your programmes.",
  steps: ["Click a test to see its students with their totals.", "Click a student to see their published result."],
};

const sharedReports: HelpTopic = {
  id: "coach-reports", paths: ["/mentor/reports"], title: "Shared reports",
  summary: "Reports an Administrator shared with you. Each shows only the rows you are allowed to see.",
  steps: ["Click a report to open it.", "Download it if your access allows."],
};

export const COACH_GUIDE: RoleGuide = {
  role: "COACH",
  audience: "Coaches",
  gettingStarted: [openWebsite, signIn, forgotPassword, phoneMenu],
  topics: [coachDashboard, courses, assignments, reviews, marking, questionMarking, coachStudents, coachResults, sharedReports, discussion, notifications, profile, otherProfile, settings],
};

const programme: HelpTopic = {
  id: "hc-programme", paths: ["/mentor/programme"], title: "Programme",
  summary: "The programmes you head: students, coaches, course access, coach permissions and progress.",
  steps: [
    "Choose the programme if you head several, then a view.",
    "Students: click Add a student (only students in no programme yet), or End membership on a row.",
    "Coaches: click Invite a coach; the coach receives an e-mail to set their password.",
    "Course access: choose the Coach, the Course and the Division, then click Give access.",
    "Coach permissions: turn a part off, write the reason, then click Take it away.",
  ],
  tips: ["Ending a membership keeps the person's account, work and results; you can add them back.", "Overview, Student progress, Coach activity and Activity log are for following the programme."],
};

const tests: HelpTopic = {
  id: "hc-tests", paths: ["/mentor/tests"], title: "Tests",
  summary: "Tests of the subjects you head: create, publish, give extensions, share the marking, review and publish results.",
  steps: [
    "Click New test: fill in the details, add the questions (they must add up to the maximum marks) and the paper and marking guide, then Create test.",
    "Open the draft and click Publish when it is ready.",
    "Follow the Submissions tab; give more time in Extensions (one student, one teacher or the whole test, with a reason).",
    "In Markers & distribution, tick coaches and click Distribute, or assign papers one by one.",
    "In Review, approve, return for correction, ask for a second marking or choose the mark.",
    "In Publishing, click Publish N approved results.",
  ],
  tips: ["The History tab keeps every change and decision; it cannot be edited.", "Rankings are internal: only Administrators and the subject's Head Coaches see them."],
};

const markingOverview: HelpTopic = {
  id: "hc-marking-overview", paths: ["/mentor/marking-overview"], title: "Marking overview",
  summary: "Every paper's marking status, each test's progress and each coach's workload, for the subjects you head.",
  steps: ["Choose a test to follow it.", "Open a paper waiting for approval to review it.", "Look at the coaches' workload before you distribute more papers."],
};

const testReports: HelpTopic = {
  id: "hc-test-reports", paths: ["/mentor/test-reports"], title: "Test reports",
  summary: "Published tests with their submissions, approved results and figures.",
  steps: ["Choose a test.", "Read or export the figures."],
};

export const HEAD_COACH_GUIDE: RoleGuide = {
  role: "HEAD_COACH",
  audience: "Head Coaches",
  gettingStarted: [openWebsite, signIn, forgotPassword, phoneMenu],
  topics: [
    { ...coachDashboard, summary: "What is happening in your programmes: tests, papers awaiting approval and your coaches' work." },
    programme, tests, markingOverview, testReports, courses, assignments, reviews, sharedReports, discussion, notifications, profile, otherProfile, settings,
  ],
};
