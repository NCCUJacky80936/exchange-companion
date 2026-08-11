import type { JourneyTask } from "./types";
import { exchangeProfile } from "./profile";

function compactDate(date: string): string {
  return date.replaceAll("-", "");
}

function nextDay(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function localDateTime(dateTime: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(dateTime);
  if (!match) return null;
  const local = match[1];
  const value = new Date(`${local}:00Z`);
  if (Number.isNaN(value.getTime()) || value.toISOString().slice(0, 16) !== local) return null;
  return local;
}

function compactDateTime(dateTime: string): string {
  return dateTime.replaceAll("-", "").replace(":", "");
}

function oneHourLater(dateTime: string): string {
  const value = new Date(`${dateTime}:00Z`);
  value.setUTCHours(value.getUTCHours() + 1);
  return value.toISOString().slice(0, 16);
}

function escapeIcs(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

export function googleCalendarUrl(task: JourneyTask): string {
  if (!task.dueDate) return "";
  const scheduledAt = task.scheduledAt ? localDateTime(task.scheduledAt) : null;
  const dates = scheduledAt
    ? `${compactDateTime(scheduledAt)}00/${compactDateTime(oneHourLater(scheduledAt))}00`
    : `${compactDate(task.dueDate)}/${compactDate(nextDay(task.dueDate))}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${exchangeProfile.appName}｜${task.title}`,
    dates,
    details: `${task.description}${task.sourceUrl ? `\n${task.sourceUrl}` : ""}`,
  });
  if (scheduledAt) params.set("ctz", task.timeZone ?? exchangeProfile.hostTimeZone);
  if (task.location) params.set("location", task.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadIcs(tasks: JourneyTask[], filename = "exchange-companion-calendar.ics"): void {
  const datedTasks = tasks.filter((task) => task.dueDate && task.status !== "not-applicable");
  const events = datedTasks.map((task) => {
    const scheduledAt = task.scheduledAt ? localDateTime(task.scheduledAt) : null;
    const timing = scheduledAt
      ? [
          `DTSTART;TZID=${task.timeZone ?? exchangeProfile.hostTimeZone}:${compactDateTime(scheduledAt)}00`,
          `DTEND;TZID=${task.timeZone ?? exchangeProfile.hostTimeZone}:${compactDateTime(oneHourLater(scheduledAt))}00`,
        ]
      : [
          `DTSTART;VALUE=DATE:${compactDate(task.dueDate!)}`,
          `DTEND;VALUE=DATE:${compactDate(nextDay(task.dueDate!))}`,
        ];
    return [
      "BEGIN:VEVENT",
      `UID:${task.id}@exchange-companion.local`,
      `DTSTAMP:${new Date().toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
      ...timing,
      `SUMMARY:${escapeIcs(`${exchangeProfile.appName}｜${task.title}`)}`,
      `DESCRIPTION:${escapeIcs(`${task.description}${task.sourceUrl ? `\n${task.sourceUrl}` : ""}`)}`,
      ...(task.location ? [`LOCATION:${escapeIcs(task.location)}`] : []),
      "END:VEVENT",
    ].join("\r\n");
  });

  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Exchange Companion//${escapeIcs(exchangeProfile.hostCountry)} Exchange//ZH-TW`,
    "CALSCALE:GREGORIAN",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([calendar], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
