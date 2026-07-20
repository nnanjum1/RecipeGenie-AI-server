const fetch = global.fetch;

(async () => {
    try {
        const key = "56771053-f6589fb54f2d341c51ff7db18";

        const url = new URL("https://pixabay.com/api/");

        url.searchParams.append("key", key);
        url.searchParams.append("q", "pizza");
        url.searchParams.append("image_type", "photo");
        url.searchParams.append("category", "food");
        url.searchParams.append("per_page", "5");

        const response = await fetch(url);

        console.log("Status:", response.status);

        const data = await response.json();

        console.log(data);

    } catch (error) {
        console.log(error);
    }
})();