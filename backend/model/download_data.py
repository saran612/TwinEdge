import os
import urllib.request

def download_file(url, dest_path):
    print(f"Downloading {url} to {dest_path}...")
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    urllib.request.urlretrieve(url, dest_path)
    print(f"Finished downloading {dest_path}")

def main():
    base_url = "https://raw.githubusercontent.com/mapr-demos/predictive-maintenance/master/notebooks/jupyter/Dataset/CMAPSSData/"
    files = ["train_FD001.txt", "test_FD001.txt", "RUL_FD001.txt"]
    dest_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "raw")
    
    for file_name in files:
        url = base_url + file_name
        dest_path = os.path.join(dest_dir, file_name)
        download_file(url, dest_path)

if __name__ == "__main__":
    main()
