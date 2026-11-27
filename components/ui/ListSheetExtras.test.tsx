import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ListSheetExtras from "./ListSheetExtras";

const noop = () => {};

describe("ListSheetExtras", () => {
  it("offers Not for me and a danger Remove when the title is on a list", () => {
    const html = renderToStaticMarkup(<ListSheetExtras onNotForMe={noop} onRemove={noop} />);
    expect(html).toContain("Not for me");
    expect(html).toContain("Remove from my list");
    expect(html).toContain("text-danger");
    expect(html).toContain("border-t");
  });

  it("hides Remove for a title that is not on a list", () => {
    const html = renderToStaticMarkup(<ListSheetExtras onNotForMe={noop} />);
    expect(html).toContain("Not for me");
    expect(html).not.toContain("Remove from my list");
  });

  it("turns Not for me into an undo when already marked", () => {
    const html = renderToStaticMarkup(<ListSheetExtras onNotForMe={noop} notForMe />);
    expect(html).toContain("(undo)");
    expect(html).toContain('aria-pressed="true"');
  });
});
