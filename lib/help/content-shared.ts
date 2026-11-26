/** Help topics every role shares: signing in, passwords, the phone menu, notifications, profile and settings. */
import type { HelpTopic } from "./types";

export const SITE_URL = "https://lms.rwandaolympiadfoundation.org";

export const openWebsite: HelpTopic = {
  id: "start-open",
  paths: [],
  title: "Opening ROF LMS",
  summary: `ROF LMS works in any web browser, on a computer or a phone. Its address is ${SITE_URL}.`,
  steps: [
    `Open ${SITE_URL} in your browser (Chrome, Edge, Firefox or Safari).`,
    "On the home page, click Log in at the top right.",
  ],
  tips: ["Save the address as a bookmark, or add it to your phone's home screen, so you can open it in one tap next time."],
};

export const signIn: HelpTopic = {
  id: "start-sign-in",
  paths: [],
  title: "Signing in",
  summary: "You sign in with your username or your e-mail address, and your password.",
  steps: [
    "In Username or email, type your username (for example aline.uwase) or your e-mail address. Both work.",
    "In Password, type your password. Click the eye icon to check what you typed.",
    "Click Sign in. Your first page opens.",
  ],
  tips: [
    "After 5 wrong passwords in a row from the same device or network, your username is locked there for 15 minutes. Wait, then try again with the right password.",
    "Some accounts are asked one missing detail the first time (date of birth or gender). You give it once, then click Continue.",
  ],
};

export const forgotPassword: HelpTopic = {
  id: "start-forgot",
  paths: [],
  title: "Forgotten password",
  summary: "Choose a new password from a link sent to your e-mail.",
  steps: [
    "On the sign-in page, click Forgot password?.",
    "Type the e-mail address of your account and click Send reset link.",
    "Open the e-mail \"Reset your password\" and click Reset my password. The link works for 30 minutes; only the newest link works.",
    "Type your new password twice (at least 8 characters, with a letter and a number) and click Reset password.",
    "Sign in with the new password. You are signed out on every other device.",
  ],
  tips: ["No e-mail? Check your spam folder. ROF can send a limited number of e-mails each day; if none arrives, try again the next day or contact technical support."],
};

export const phoneMenu: HelpTopic = {
  id: "start-phone",
  paths: [],
  title: "Using ROF LMS on a phone",
  summary: "Every page works on a phone. The menu is hidden to leave room for the page.",
  steps: [
    "Tap the three-line button at the top left to open the menu.",
    "Tap a menu item to go there.",
    "The bell (notifications), Help and your picture stay at the top right.",
  ],
};

export const notifications: HelpTopic = {
  id: "notifications",
  paths: ["/student/notifications", "/teacher/notifications", "/mentor/notifications", "/admin/notifications"],
  title: "Notifications",
  summary: "Everything ROF LMS tells you: new work, results, decisions and messages.",
  steps: [
    "Click the bell at the top right to see the newest notifications, or View all notifications for the full list.",
    "Use All / Unread and the Category list to filter.",
    "Click a notification to open what it is about.",
    "Use the envelope icon to mark one as read or unread, or Mark all as read at the top.",
  ],
  tips: ["Choose which notifications also reach you by e-mail in Settings."],
};

export const profile: HelpTopic = {
  id: "profile",
  paths: ["/student/profile", "/teacher/profile", "/mentor/profile", "/admin/profile"],
  title: "My Profile",
  summary: "Your picture and account details.",
  steps: [
    "Open your name at the top right, then My Profile.",
    "Change your picture or the details you are allowed to edit, then save.",
  ],
  tips: ["Your password, devices and e-mail notifications are in Settings, not here."],
};

export const otherProfile: HelpTopic = {
  id: "other-profile",
  paths: ["/student/profiles", "/teacher/profiles", "/mentor/profiles", "/admin/profiles"],
  title: "A person's profile",
  summary: "The public part of another person's profile: name, picture and role. Contact details are never shown.",
};

export const settings: HelpTopic = {
  id: "settings",
  paths: ["/student/account", "/teacher/account", "/mentor/account", "/admin/account"],
  title: "Settings",
  summary: "Your sign-in details, password, devices and notification e-mails.",
  steps: [
    "To change your password: type your Current password, then the New password twice (at least 8 characters, with a letter and a number), and click Change password.",
    "Under devices, sign out a device you no longer use, or sign out everywhere.",
    "Under notification e-mails, choose what also reaches you by e-mail.",
  ],
  tips: ["Your username and e-mail are changed by an Administrator, on request."],
};

export const discussion: HelpTopic = {
  id: "discussion",
  paths: ["/discussions", "/student/discussions", "/mentor/discussions", "/admin/discussions"],
  title: "Discussion",
  summary: "Questions and answers about a course or an assignment.",
  steps: [
    "Read the topic and its comments.",
    "Type in \"Write a comment...\" and send it. You can Reply to a comment.",
    "Edit or Delete your own comments with the buttons under them.",
  ],
  tips: ["Be kind and stay on the subject. A comment can be reported to the moderators."],
};
