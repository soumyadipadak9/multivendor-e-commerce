// Get the HTML element
const htmlElement = document.documentElement;

// Get the computed style of the HTML element
const computedStyle = window.getComputedStyle(htmlElement);

// Get the height of the HTML element in pixels
const heightInPixels = parseFloat(computedStyle.getPropertyValue('height'));

// Convert the height from pixels to viewport height (vh)
const viewportHeight = (heightInPixels / window.innerHeight) * 100;

// console.log('HTML height in vh:', viewportHeight + 'vh');

if (viewportHeight < 100) {
    const foot = document.getElementsByTagName("footer")[0].style
    foot.position = "absolute";
    foot.width = "100%";
    foot.bottom = 0;
}
else{
    const foot = document.getElementsByTagName("footer")[0].style
    foot.position = "";
    foot.width = "";
    foot.bottom = 0;
}
