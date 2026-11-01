import { MatrixPreview, ReceiptPreview, UploadPreview } from "@/components/marketing/workflow-previews";
import { workflowStages } from "@/lib/workflow-story";

const previews = [MatrixPreview, UploadPreview, ReceiptPreview];

/** Server-rendered reading order for small viewports, reduced motion and no JS. */
export function WorkflowFallback() {
  return <>
    {workflowStages.map((stage, index) => {
      const Preview = previews[index];
      return <section className={`marketing-workflow-row${index === 1 ? " reversed" : ""}`} key={stage.id} aria-labelledby={stage.id}>
        <div className="marketing-workflow-copy" data-motion-group>
          <span className="marketing-step-number">{stage.label}</span>
          <h2 id={stage.id}>{stage.title}</h2>
          <p>{stage.description}</p>
          <span className="marketing-detail">{stage.detail}</span>
        </div>
        <Preview />
      </section>;
    })}
  </>;
}
