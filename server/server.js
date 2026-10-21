
const express = require("express");
const { processTrade } = require("../backend/backend");

const app = express();
const PORT = 3000;

// Allow the server to receive JSON
app.use(express.json());

// POST endpoint for MarketStreet trades
app.post("/api/trades", (req, res) => {
    try {
        const trade = req.body || {};

        // Reuse the existing Week 8 business logic
        const result = processTrade(trade);

        // Return JSON with the correct status code
        if (result.status === "ACCEPTED") {
            return res.status(200).json(result);
        }

        return res.status(400).json(result);

    } catch (error) {
        return res.status(500).json({
            status: "ERROR",
            message: "An unexpected server error occurred."
        });
    }
});

// Start the local server
app.listen(PORT, () => {
    console.log(`MarketStreet server running at http://localhost:${PORT}`);
});

