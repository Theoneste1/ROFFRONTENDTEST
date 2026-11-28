/**
 * One help topic's text — what the page is for, the steps, and "good to know" — exactly as the Help panel and the
 * in-system user guide show it (one rendering, so the two never differ).
 */
import type { HelpTopic } from "@/lib/help/types";

const HEADING = "text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-brand";

export default function HelpTopicBody({ topic, summaryHeading = "What you can do here" }: { topic: HelpTopic; summaryHeading?: string }) {
  return (
    <>
      <section>
        <h3 className={`mb-1 ${HEADING}`}>{summaryHeading}</h3>
        <p>{topic.summary}</p>
      </section>
      {topic.steps && topic.steps.length > 0 && (
        <section>
          <h3 className={`mb-2 ${HEADING}`}>Steps</h3>
          <ol className="space-y-2">
            {topic.steps.map((s, i) => (
              <li key={i} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2.5">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-xs font-bold text-white" aria-hidden="true">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {topic.tips && topic.tips.length > 0 && (
        <section>
          <h3 className={`mb-1.5 ${HEADING}`}>Good to know</h3>
          <ul className="space-y-1.5">
            {topic.tips.map((tip, i) => (
              <li key={i} className="relative pl-3.5 text-slate-600 before:absolute before:left-0 before:top-[0.6em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-amber-300">{tip}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
