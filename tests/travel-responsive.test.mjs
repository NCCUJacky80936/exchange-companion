import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const planner = await readFile(new URL("../app/components/TravelPlanner.tsx", import.meta.url), "utf8");
const staySection = await readFile(new URL("../app/components/TravelStaySection.tsx", import.meta.url), "utf8");

test("travel grid and its direct children remain shrinkable on phone widths", () => {
  assert.match(css, /\.travel-page\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.travel-workspace\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.travel-main\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.travel-main\s*>\s*\*\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*min-width:\s*0[^}]*box-sizing:\s*border-box/);
});

test("day tabs own their horizontal overflow instead of widening the document", () => {
  assert.match(css, /\.day-tabs\s*\{[^}]*max-width:[^;}]+;[^}]*min-width:\s*0[^}]*overflow-x:\s*auto[^}]*overscroll-behavior-inline:\s*contain/);
});

test("mobile modal height uses the dynamic iOS viewport", () => {
  assert.match(css, /\.modal-card\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*20px\)/);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x:\s*hidden/);
});

test("hotel details open in a floating dialog without pushing the itinerary", () => {
  assert.match(staySection, /aria-haspopup="dialog"/);
  assert.match(staySection, /setDetailStayId\(stay\.id\)/);
  assert.match(staySection, /className="travel-stay-detail-modal"/);
  assert.match(staySection, /className="modal-backdrop"/);
  assert.match(staySection, /createPortal\([\s\S]*document\.body/);
  assert.doesNotMatch(staySection, /className="travel-stay-popover"/);
  assert.doesNotMatch(staySection, /setPinnedId|setHoveredId/);
  assert.match(css, /\.modal-backdrop\s*\{[^}]*position:\s*fixed/);
  assert.match(css, /\.travel-stay-detail-modal-body\s*\{[^}]*display:\s*grid/);
});

test("the hotel section uses straightforward accommodation labels", () => {
  assert.match(staySection, />Accommodation<\/p><h3[^>]*>住宿<\/h3>/);
  assert.doesNotMatch(staySection, /Stay first, days later|住宿基地/);
});

test("hotel bases and references precede itinerary days while the conflict calendar is last", () => {
  assert.ok(planner.indexOf("<TravelStaySection") < planner.indexOf('<div className={`day-tabs'));
  assert.ok(planner.lastIndexOf('className="travel-calendar-bottom academic-planner-stack"') > planner.lastIndexOf('className="travel-workspace'));
  assert.ok(planner.indexOf('title="課表"') < planner.indexOf('title="學業與交換不可撞期"'));
});

test("course schedule uses a Monday to Friday weekly timetable without dropping legacy entries", () => {
  assert.match(planner, /function CourseTimetable/);
  assert.match(planner, /const courseWeekdays = \["一", "二", "三", "四", "五"\]/);
  assert.match(planner, /name="weekday"[\s\S]*選擇星期/);
  assert.match(planner, /className="course-unplaced"/);
  assert.match(css, /\.course-timetable-scroll\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.course-timetable\s*\{[^}]*min-width:\s*760px/);
  assert.match(css, /\.course-day-columns\s*\{[^}]*grid-template-columns:\s*repeat\(5,/);
  assert.match(css, /@media \(max-width:\s*820px\)[\s\S]*\.course-timetable\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0/);
  assert.match(css, /@media \(max-width:\s*820px\)[\s\S]*\.course-timetable-header\s*\{[^}]*grid-template-columns:\s*32px repeat\(5,/);
  assert.match(planner, /className="course-slot-more"/);
});

test("travel entries use a vertical accordion and reference actions stay at the top right", () => {
  assert.match(planner, /const \[expandedTripId, setExpandedTripId\] = useState\(""\)/);
  assert.match(planner, /target\?\.scrollIntoView\(\{ behavior: reduceMotion \? "auto" : "smooth", block: "start" \}\)/);
  assert.match(planner, /aria-expanded=\{expanded\}/);
  assert.match(planner, /trip-accordion-panel/);
  assert.match(css, /\.trip-card-list\s*\{[^}]*display:\s*grid/);
  assert.match(css, /\.travel-reference-grid article > div\s*\{[^}]*position:\s*absolute[^}]*top:\s*7px[^}]*right:\s*35px/);
  assert.match(css, /\.travel-overview-actions\s*\{[^}]*position:\s*absolute[^}]*top:\s*0[^}]*right:\s*0/);
  assert.match(planner, /aria-label="更多旅行操作"/);
  assert.match(planner, /className="travel-action-popover paper-card"/);
  assert.ok(planner.indexOf("複製摘要") < planner.indexOf("itinerary-heading"));
});

test("expanded accordion reads as one paper sheet instead of nested heavy cards", () => {
  assert.match(css, /\.trip-accordion-panel\s*\{[^}]*repeating-linear-gradient[^}]*box-shadow:\s*0\s+6px\s+0/);
  assert.match(css, /\.travel-overview\s*\{[^}]*border:\s*0[^}]*border-bottom:[^}]*background:\s*transparent[^}]*box-shadow:\s*none/);
  assert.match(css, /\.itinerary-board\s*\{[^}]*border:\s*0[^}]*background:\s*transparent[^}]*box-shadow:\s*none/);
  assert.match(css, /\.conflict-panel\s*\{[^}]*width:\s*auto[^}]*max-width:\s*760px[^}]*border:\s*0[^}]*border-block:[^}]*box-shadow:\s*none/);
});

test("expanded travel content replaces the ticket face and keeps location with actions", () => {
  assert.match(planner, /!expanded \? <motion\.button/);
  assert.match(planner, /mode="popLayout"/);
  assert.match(planner, /layout="position"/);
  assert.doesNotMatch(planner, /mode="wait"/);
  assert.match(planner, /className="travel-overview-toolbar"/);
  assert.match(planner, /className="destination-route"[\s\S]*className="travel-overview-actions trip-cover-actions"/);
  assert.match(css, /\.travel-overview-toolbar\s*\{[^}]*display:\s*flex[^}]*justify-content:\s*space-between/);
  assert.match(css, /\.trip-accordion-item\.expanded \.trip-cover-actions\s*\{[^}]*position:\s*static/);
  assert.doesNotMatch(planner, /className="travel-overview-top"/);
  assert.match(planner, /<h2>\{selectedPlan\.title\}<\/h2>/);
});

test("collapsed travel entries use the taped paper-card language from the home dashboard", () => {
  assert.match(planner, /className=\{`trip-accordion-item paper-card/);
  assert.match(css, /\.trip-card-list\s*\{[^}]*gap:\s*16px[^}]*border-block:\s*0\s*!important/);
  assert.match(css, /\.trip-accordion-item\.collapsed\s*\{[^}]*border-top:\s*3px solid color-mix/);
  assert.match(css, /\.trip-accordion-item\.collapsed::before\s*\{[^}]*background:\s*color-mix[^}]*content:\s*""/);
  assert.match(css, /\.trip-accordion-item\.collapsed::after\s*\{[^}]*background:\s*linear-gradient/);
  assert.match(css, /\.trip-accordion-item\.collapsed \.trip-ticket,[\s\S]*background:\s*transparent\s*!important/);
});

test("collapsed travel cards rotate the home palette through borders and tape", () => {
  for (const color of ["yellow", "blue", "pink", "sage"]) {
    assert.match(css, new RegExp(`--trip-card-accent:\\s*var\\(--${color}\\)`));
  }
  assert.match(css, /border-top:\s*3px solid color-mix\(in srgb,\s*var\(--trip-card-accent\)\s*76%,\s*var\(--ink\)\)/);
  assert.match(css, /background:\s*color-mix\(in srgb,\s*var\(--trip-card-accent\)\s*56%,\s*transparent\)/);
});

test("travel titles stay complete on one line and new edits are limited to ten characters", () => {
  assert.match(planner, /name="title"[\s\S]*maxLength=\{10\}/);
  assert.match(planner, /Array\.from\(event\.target\.value\)\.slice\(0, 10\)\.join\(""\)/);
  assert.match(planner, /\{titleLength\}\/10 個字，會完整顯示在旅行車票上/);
  assert.match(css, /\.travel-overview-title h2\s*\{[^}]*overflow:\s*visible[^}]*text-overflow:\s*clip[^}]*white-space:\s*nowrap/);
  assert.doesNotMatch(css, /\.travel-overview-title h2\s*\{[^}]*text-overflow:\s*ellipsis/);
});

test("travel creation forms open in modal dialogs instead of extending the accordion", () => {
  assert.match(staySection, /className=\{`modal-card travel-entry-modal paper-card/);
  assert.match(staySection, />新增飯店</);
  assert.match(staySection, />新增參考</);
  assert.doesNotMatch(staySection, /addingStay \? <StayForm/);
  assert.doesNotMatch(staySection, /addingReference \? <ReferenceForm/);
  assert.match(planner, /className="add-activity-trigger"/);
  assert.match(planner, />加入這一天</);
  assert.match(planner, /\(addingActivity \|\| editingActivityId\) && selectedDay \? <ActivityModal/);
  assert.match(planner, /activity=\{selectedDay\.activities\.find/);
  assert.doesNotMatch(planner, /add-activity-panel/);
  assert.match(css, /\.travel-entry-modal/);
});
