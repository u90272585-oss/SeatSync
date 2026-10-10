// SeatSync - Darina's homepage


// Smooth scrolling

document
    .querySelectorAll('a[href^="#"]')
    .forEach(link => {

        link.addEventListener("click", function(event) {

            const target =
                document.getElementById(
                    this.getAttribute("href").slice(1)
                );

            if (target) {

                event.preventDefault();

                target.scrollIntoView({
                    behavior: "smooth"
                });

            }

        });

    });


// Current year

const copyright =
    document.querySelector(".copyright");

if (copyright) {

    copyright.textContent =
        `© ${new Date().getFullYear()} SeatSync`;

}