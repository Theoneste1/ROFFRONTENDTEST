/** Help for Students and Teachers (from the Student and Teacher user guides, checked against production 2026-11-25). */
import type { RoleGuide } from "./types";
import { discussion, forgotPassword, notifications, openWebsite, otherProfile, phoneMenu, profile, settings, signIn, userGuide } from "./content-shared";

export const STUDENT_GUIDE: RoleGuide = {
  role: "STUDENT",
  audience: "Students",
  gettingStarted: [openWebsite, signIn, forgotPassword, phoneMenu],
  topics: [
    {
      id: "student-dashboard", paths: ["/student/dashboard"], title: "Dashboard",
      summary: "Your page for today: new work, deadlines, your tests and your place on the leaderboard.",
      steps: ["Look at what is due soon and open it from here.", "Open a course, an assignment or a test straight from its box.", "Use the menu on the left for everything else."],
      tips: ["Everything you see belongs to your Olympiad level (Junior, Middle or Senior)."],
    },
    {
      id: "student-leaderboard", paths: ["/student/leaderboard"], title: "Leaderboard",
      summary: "See how you rank against the students of your level.",
      steps: ["Use the switch at the top right: Students or Schools.", "Find your own row; it is highlighted."],
    },
    {
      id: "student-courses", paths: ["/student/courses"], title: "Courses",
      summary: "The subjects of your Olympiad level, with their books, past papers, notes and discussions.",
      steps: ["Click a course card to open it.", "Use the tabs: Overview, Books, Past Papers, Notes & Materials and Discussion.", "Click a resource to read or download it."],
      tips: ["Ask a question in the Discussion tab: your coaches and other students can answer."],
    },
    {
      id: "student-resources", paths: ["/student/resources", "/courses"], title: "Resources",
      summary: "Books, notes and past papers shared by your coaches.",
      steps: ["Type in the search box to find a title, author or tag.", "Narrow the list with the topic and kind buttons.", "Click a resource to open it, or Open course to go to its course."],
    },
    {
      id: "student-assignments", paths: ["/student/assignments", "/assignments"], title: "Assignments",
      summary: "The practice work your coaches gave your level, and what you still have to do.",
      steps: [
        "Click Assignments, then All Assignments. Use the search box and the filter buttons.",
        "Click Start (not started) or View to open an assignment.",
        "In \"Your Submission\", type your answer, give a link, or use Upload Files. Add a note for your coach if you want.",
        "Click Submit (or Resubmit), then confirm.",
      ],
      tips: ["Check the deadline at the top of the assignment.", "When your work is reviewed and published, the assignment shows Your Score and Coach Feedback."],
    },
    {
      id: "student-assignment-results", paths: ["/student/assignments/results"], title: "Assignment results",
      summary: "Your published assignment results and your coaches' feedback.",
      steps: ["Choose a Course and how to Arrange by, then click Apply.", "Read the score and the feedback of each assignment."],
    },
    {
      id: "student-tests", paths: ["/student/tests"], title: "My tests",
      summary: "The Olympiad tests of your level. The deadline shown is yours, including any extension.",
      steps: [
        "Filter with All, Open, Not open yet and Closed. Click Answer on an open test.",
        "Read the deadline, the answer format and the questions (open the test paper if there is one).",
        "Type your answer, or under Pages use Take a photo or Add pages: one page per photo, in order.",
        "Check everything, then click Submit.",
      ],
      tips: [
        "After you submit, your answer is locked. Only an Administrator can allow a new submission.",
        "For photos: good light, the whole page, and your pages numbered. Charge your phone before the test.",
        "Times are shown in your device's time zone.",
      ],
    },
    {
      id: "student-results", paths: ["/student/results", "/results"], title: "My results",
      summary: "Your published test results: marks per question, total and comments.",
      steps: ["Click a test to see your marks per question and the comments.", "Results appear only once they are published."],
    },
    discussion, notifications, profile, otherProfile, settings, userGuide,
  ],
};

export const TEACHER_GUIDE: RoleGuide = {
  role: "TEACHER",
  audience: "Teachers",
  gettingStarted: [openWebsite, signIn, forgotPassword, phoneMenu],
  topics: [
    {
      id: "teacher-students", paths: ["/teacher/dashboard"], title: "My students",
      summary: "Every student you are responsible for: the students of your schools and the students assigned to you.",
      steps: [
        "Type in \"Search by name or username…\".",
        "Choose a Grade, or \"All grades\".",
        "Choose Shown because: all your students, \"Students of my schools\" or \"Assigned to me\".",
        "Click Open on a row to see a student's page (when you have that permission).",
      ],
      tips: ["A student appears once their school is verified by an Administrator.", "An Administrator can give you extra permissions for some or all of your students."],
    },
    {
      id: "teacher-student", paths: ["/teacher/students"], title: "A student's page",
      summary: "One student of your schools: profile, progress and, with permission, work you submit for them.",
      steps: ["Read the Profile section.", "To submit an assignment for the student, choose it, add their answer and files, then click Submit for <name>.", "Click My students at the top to go back."],
      tips: ["Work you submit stays the student's; you are recorded as the person who sent it."],
    },
    {
      id: "teacher-tests", paths: ["/teacher/tests"], title: "Tests",
      summary: "Published tests. You can submit answers for your students until their deadline.",
      steps: [
        "Filter with All, Open, Not open yet and Closed. Click Students on a test.",
        "On \"Students for this test\", read the counters and filter by state, level or subject.",
        "Click Submit on a student's row. Add their pages (one photo or scan per page, in order) or type the answer.",
        "Check that the pages belong to this student and are complete, then click Submit.",
      ],
      tips: ["After submitting, the answer is locked. Only an Administrator can unlock it.", "Late (blocked) means the deadline has passed for that student."],
    },
    {
      id: "teacher-results", paths: ["/teacher/results"], title: "Results",
      summary: "Published test results of your students.",
      steps: ["Click a test to see your students by name with their totals.", "Click Details for one student's marks per question and comments.", "Click All results to go back."],
    },
    {
      id: "teacher-reports", paths: ["/teacher/reports"], title: "Shared reports",
      summary: "Reports an Administrator shared with you. Each shows only the rows you are allowed to see.",
      steps: ["Click a report to open it.", "Download it if your access allows (View, Download or Edit)."],
    },
    notifications, profile, otherProfile, settings, userGuide,
  ],
};
