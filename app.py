from flask import Flask, render_template, request, jsonify
from openai import OpenAI
from agents import TourismOrchestrator
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Initialize the orchestrator
orchestrator = TourismOrchestrator(client)

@app.route("/")
def home():
    """Render the main page"""
    return render_template("index.html")

@app.route("/api/query", methods=["POST"])
def process_query():
    """Process user queries"""
    try:
        data = request.get_json()
        user_query = data.get("query", "")
        
        if not user_query:
            return jsonify({
                "success": False,
                "message": "Please provide a query"
            }), 400
        
        # Process the request through the orchestrator
        result = orchestrator.process_request(user_query)
        
        return jsonify(result)
    
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"An error occurred: {str(e)}"
        }), 500

@app.route("/health")
def health():
    """Health check endpoint"""
    return jsonify({"status": "healthy"})

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
