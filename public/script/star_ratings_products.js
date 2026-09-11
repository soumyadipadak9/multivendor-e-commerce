const star_ratings = document.getElementsByClassName("star_ratings");
console.log(star_ratings);
for (let i = 0; i < star_ratings.length; i++) {
    const productID = star_ratings[i].getAttribute("product_id");
    console.log(productID);
    const url = `http://localhost:8000/productRatings/${productID}`;

    async function fetchData(url) {
        const response = await fetch(url);
        const dataObj = await response.json();
        return dataObj;
    }

    async function fetchDataAndLog() {
        const ratings_data = await fetchData(url);
        console.log(ratings_data.average_ratings);

        for (let j = 0; j < ratings_data.average_ratings; j++) {
            star_ratings[i].children[j].style.color = "green";
        }
    }
    fetchDataAndLog();
}