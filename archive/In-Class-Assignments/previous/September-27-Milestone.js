function submitTrade(event) {
    event.preventDefault();
    const form = document.querySelector("form");

    // Let the browser show its own messages for missing/invalid fields
    if (!form.checkValidity()) {
        return;
    }

    const symbol = document.getElementById("symbol").value.toUpperCase();
    const trade = document.getElementById("trade").value;
    const shares = document.getElementById("shares").value;
    const order = document.getElementById("order").value;
    const price = document.getElementById("price").value;

    const summary =
        "Trade submitted!\n\n" +
        "Symbol: " + symbol + "\n" +
        "Trade: " + trade + "\n" +
        "Shares: " + shares + "\n" +
        "Order: " + order + "\n" +
        "Price: " + (price || "N/A");

    console.log(summary);
    alert(summary);
}

document.querySelector("form").addEventListener("submit", submitTrade);
