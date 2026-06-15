const tabGroups = document.querySelectorAll("[data-tabs]");

for (const group of tabGroups) {
  const tabs = group.querySelectorAll("[data-tab]");
  const panels = group.querySelectorAll("[data-panel]");

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");

      for (const item of tabs) {
        const selected = item === tab;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-selected", String(selected));
      }

      for (const panel of panels) {
        panel.hidden = panel.getAttribute("data-panel") !== target;
      }
    });
  }
}
