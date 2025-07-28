#!/usr/bin/env python3
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "weaviate-client>=4.4.0",
#     "openai>=1.0.0",
#     "python-dotenv>=1.0.0",
# ]
# ///
"""
Script to embed all files from src/ directory into Weaviate cloud using OpenAI text-embedding-3-small
"""

import os
import json
import logging
from pathlib import Path
from typing import List, Dict, Any
import hashlib

from dotenv import load_dotenv
import weaviate
from openai import OpenAI
from weaviate.classes.config import Configure, Property, DataType, VectorDistances
from weaviate.classes.data import DataObject

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class DocumentEmbedder:
    def __init__(self, weaviate_url: str, weaviate_api_key: str, openai_api_key: str):
        """Initialize the DocumentEmbedder with API credentials"""
        self.weaviate_url = weaviate_url
        self.weaviate_api_key = weaviate_api_key
        self.openai_api_key = openai_api_key
        
        # Initialize clients
        self.openai_client = OpenAI(api_key=openai_api_key)
        self.weaviate_client = None
        
    def connect_to_weaviate(self):
        """Establish connection to Weaviate cloud"""
        try:
            self.weaviate_client = weaviate.connect_to_weaviate_cloud(
                cluster_url=self.weaviate_url,
                auth_credentials=weaviate.AuthApiKey(self.weaviate_api_key),
                headers={
                    "X-OpenAI-Api-Key": self.openai_api_key
                }
            )
            logger.info("Successfully connected to Weaviate cloud")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to Weaviate: {e}")
            return False
    
    def create_schema(self):
        """Create or update the Document class schema in Weaviate"""
        try:
            # Check if collection already exists
            if self.weaviate_client.collections.exists("Document"):
                logger.info("Document collection already exists")
                collection = self.weaviate_client.collections.get("Document")
                logger.info("Successfully retrieved existing Document collection")
                logger.info(f"Collection object: {collection}")
                logger.info(f"Collection type: {type(collection)}")
                return collection
            
            # Create new collection
            collection = self.weaviate_client.collections.create(
                name="Document",
                vectorizer_config=Configure.Vectorizer.text2vec_openai(
                    model="text-embedding-3-small"
                ),
                properties=[
                    Property(name="filename", data_type=DataType.TEXT, description="Name of the source file"),
                    Property(name="filepath", data_type=DataType.TEXT, description="Full path to the source file"),
                    Property(name="content", data_type=DataType.TEXT, description="Content of the document"),
                    Property(name="file_size", data_type=DataType.INT, description="Size of the file in bytes"),
                    Property(name="content_hash", data_type=DataType.TEXT, description="SHA256 hash of the content"),
                    Property(name="file_extension", data_type=DataType.TEXT, description="File extension")
                ]
            )
            logger.info("Successfully created Document collection schema")
            return collection
        except Exception as e:
            logger.error(f"Failed to create schema: {e}")
            import traceback
            logger.error(f"Schema creation traceback: {traceback.format_exc()}")
            return None
    
    def read_file_content(self, file_path: Path) -> str:
        """Read and return the content of a file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            logger.warning(f"Failed to read {file_path}: {e}")
            return ""
    
    def calculate_content_hash(self, content: str) -> str:
        """Calculate SHA256 hash of content"""
        return hashlib.sha256(content.encode('utf-8')).hexdigest()
    
    def prepare_document_data(self, file_path: Path) -> Dict[str, Any]:
        """Prepare document data for insertion into Weaviate"""
        content = self.read_file_content(file_path)
        
        return {
            "filename": file_path.name,
            "filepath": str(file_path),
            "content": content,
            "file_size": file_path.stat().st_size,
            "content_hash": self.calculate_content_hash(content),
            "file_extension": file_path.suffix
        }
    
    def embed_documents(self, src_directory: str) -> bool:
        """Embed all documents from the src directory into Weaviate"""
        try:
            collection = self.create_schema()
            if collection is None:
                logger.error("Failed to get collection - create_schema returned None")
                return False
            logger.info("Successfully got collection, proceeding with file scanning...")
            
            src_path = Path(src_directory)
            if not src_path.exists():
                logger.error(f"Source directory {src_directory} does not exist")
                return False
            
            logger.info(f"Scanning directory: {src_path.absolute()}")
            
            # Get all files in src directory
            files = list(src_path.glob("**/*"))
            files = [f for f in files if f.is_file()]
            
            logger.info(f"Files found: {[f.name for f in files]}")
            
            logger.info(f"Found {len(files)} files to embed")
            
            if len(files) == 0:
                logger.warning("No files found in src directory!")
                return True
            
            successful_embeds = 0
            failed_embeds = 0
            
            for file_path in files:
                try:
                    logger.info(f"Processing {file_path.name}...")
                    
                    # Prepare document data
                    doc_data = self.prepare_document_data(file_path)
                    
                    # Check if document already exists (by content hash)
                    from weaviate.classes.query import Filter
                    existing = collection.query.fetch_objects(
                        filters=Filter.by_property("content_hash").equal(doc_data["content_hash"]),
                        limit=1
                    )
                    
                    if existing.objects:
                        logger.info(f"Document {file_path.name} already exists (same content hash), skipping...")
                        continue
                    
                    # Insert document into Weaviate
                    result = collection.data.insert(doc_data)
                    
                    if result:
                        logger.info(f"Successfully embedded {file_path.name}")
                        successful_embeds += 1
                    else:
                        logger.error(f"Failed to embed {file_path.name}")
                        failed_embeds += 1
                        
                except Exception as e:
                    logger.error(f"Error processing {file_path.name}: {e}")
                    failed_embeds += 1
            
            logger.info(f"Embedding complete: {successful_embeds} successful, {failed_embeds} failed")
            return failed_embeds == 0
            
        except Exception as e:
            logger.error(f"Error during embedding process: {e}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            return False
    
    def close_connection(self):
        """Close Weaviate connection"""
        if self.weaviate_client:
            self.weaviate_client.close()
            logger.info("Closed Weaviate connection")

def main():
    """Main function to run the embedding process"""
    # Load environment variables from .env file
    load_dotenv()
    
    # Load environment variables or prompt for credentials
    weaviate_url = os.getenv('WEAVIATE_URL')
    weaviate_api_key = os.getenv('WEAVIATE_API_KEY')
    openai_api_key = os.getenv('OPENAI_API_KEY')
    
    if not weaviate_url:
        weaviate_url = input("Enter your Weaviate Cloud URL: ")
    if not weaviate_api_key:
        weaviate_api_key = input("Enter your Weaviate API Key: ")
    if not openai_api_key:
        openai_api_key = input("Enter your OpenAI API Key: ")
    
    logger.info(f"Using Weaviate URL: {weaviate_url}")
    logger.info(f"OpenAI API key configured: {'Yes' if openai_api_key else 'No'}")
    
    # Initialize embedder
    embedder = DocumentEmbedder(weaviate_url, weaviate_api_key, openai_api_key)
    
    try:
        # Connect to Weaviate
        if not embedder.connect_to_weaviate():
            logger.error("Failed to connect to Weaviate. Exiting.")
            return
        
        # Embed documents
        src_directory = "src"
        logger.info(f"Starting embedding process for directory: {src_directory}")
        success = embedder.embed_documents(src_directory)
        
        if success:
            logger.info("Document embedding completed successfully!")
        else:
            logger.error("Document embedding completed with errors.")
            
    finally:
        embedder.close_connection()

if __name__ == "__main__":
    main()