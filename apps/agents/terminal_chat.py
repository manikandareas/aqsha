from colorama import Fore, Style
from uuid import uuid4

from deep_research_agent.main import run_flow

# First chat message
print(
    f"{Fore.BLUE}{Style.BRIGHT}This is a terminal chat with the research crew."
    f"{Style.RESET_ALL} (type 'exit' to quit, '/deep' or '/standard' to switch mode)"
)
conversation_id = None
depth_mode = "standard"

while True:
    user_input = input("> ")
    if user_input == "exit":
        break
    if user_input in {"/deep", "/standard"}:
        depth_mode = user_input.removeprefix("/")
        print(
            f"{Fore.YELLOW}{Style.BRIGHT}Mode:{Style.RESET_ALL} "
            f"{depth_mode}"
        )
        continue

    inputs = {
        "user_message": user_input,
        "depth_mode": depth_mode,
    }
    if conversation_id is None:
        conversation_id = str(uuid4())
    inputs["conversation_id"] = conversation_id

    response = run_flow(inputs)

    if isinstance(response, dict):
        text = response.get("response") or response.get("chat_response") or str(response)
    else:
        text = str(response)

    print(f"{Fore.GREEN}{Style.BRIGHT}Assistant:{Style.RESET_ALL} {text}\n")
