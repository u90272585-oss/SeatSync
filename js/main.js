"use strict";
const searchForm = document.querySelector("#search-form");
const searchDate = searchForm.elements.date;
const searchTime = searchForm.elements.time;
for (let minute = 540; minute <= 1110; minute += 30) {
  const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  searchTime.add(new Option(time, time));
}
function updateSearch() {
  const now = new Date();
  searchDate.min = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  for (const option of searchTime.options) {
    if (option.value)
      option.disabled =
        Boolean(searchDate.value) &&
        new Date(`${searchDate.value}T${option.value}`) <= now;
  }
  if (searchTime.selectedOptions[0]?.disabled) searchTime.value = "";
}
searchForm.addEventListener("change", updateSearch);
searchForm.addEventListener("submit", (event) => {
  updateSearch();
  if (!searchForm.reportValidity()) event.preventDefault();
});
updateSearch();
