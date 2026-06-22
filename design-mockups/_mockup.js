// Wires the auto/light/dark toggle to every themed phone frame on the page.
(function () {
  function apply(theme) {
    document.querySelectorAll('.phone[data-themed]').forEach(function (el) {
      el.setAttribute('data-theme', theme);
    });
    document.querySelectorAll('.mock-toggle button').forEach(function (b) {
      b.setAttribute('data-active', String(b.dataset.set === theme));
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.mock-toggle button');
    if (b) apply(b.dataset.set);
  });
  document.addEventListener('DOMContentLoaded', function () { apply('auto'); });
})();
