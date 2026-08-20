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

test("hotel details become an inline touch panel on phones", () => {
  assert.match(css, /\.travel-stay-popover[^}]*position:\s*static[^}]*display:\s*none/);
  assert.match(css, /\.travel-stay-card\.open\s+\.travel-stay-popover\s*\{[^}]*display:\s*grid/);
  assert.match(staySection, /setHoveredId\(""\);\s*setPinnedId/);
  assert.match(staySection, /event\.currentTarget\.blur\(\)/);
  assert.match(staySection, /aria-label=\{open \? `收合/);
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

test("mobile trip actions use a dedicated row instead of squeezing the title", () => {
  assert.match(css, /\.travel-overview\s*\{\s*padding:\s*58px\s+10px\s+18px/);
  assert.match(css, /\.travel-overview-top\s*>\s*div:nth-child\(2\)\s*\{\s*padding-right:\s*0/);
  assert.match(css, /\.travel-overview-actions\s*\{\s*top:\s*-42px;\s*right:\s*0/);
});

test("travel creation forms open in modal dialogs instead of extending the accordion", () => {
  assert.match(staySection, /className="modal-card travel-entry-modal paper-card"/);
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
