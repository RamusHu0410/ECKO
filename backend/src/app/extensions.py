from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

db = SQLAlchemy()
migrate = Migrate()
# Add other extensions here later (e.g., login_manager, jwt, cors, mail)
