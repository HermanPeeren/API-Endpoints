# PhpStorm HTTP Client collection

PhpStorm HTTP Client collection for the Joomla 6 Web Services API.

The collection has a request for every route of the [OpenAPI specification](../src/joomla-ws-api.json) in this
repository, with the example request bodies of the specification. It works in PhpStorm and in any other JetBrains IDE
with the built-in [HTTP Client](https://www.jetbrains.com/help/phpstorm/http-client-in-product-code-editor.html).

## Installation instructions

### Prepare your Joomla 6 website

1. Install Joomla 6 on your server or local development environment or use an existing Joomla 6 website.
2. Login into the Joomla 6 administrator panel and go to the Global Configuration.
3. On the **Site** tab make sure that the **Search Engine Friendly URLs** option is enabled. If it isn't, enable it and click the **Save & Close** button at the top.
4. Click on the **User Menu** button at the top right and select **Edit Account**.
5. On the **User Profile** page go to the **Joomla API Token** tab.
6. Check if the token is present, if it isn't, click the **Save** button at the top and the token will be generated.
7. Close the Edit profile page.
8. Go to **System** > **Plugins**.
9. Click on the **Filter Options** button. In the **Select Type** dropdown choose **webservices**.
10. Make sure all Web Services plugins are enabled. If any of them is disabled, enable it and click the **Save & Close** button at the top.

Your Joomla website is now ready to be used with the webservices API and the PhpStorm collection.

### Install the collection

Download this repository to your local machine. Unzip the file if needed. Once unzipped there is a folder **phpstorm** in
the repository. Copy that folder and all its contents into a project you open in PhpStorm, or open the folder itself as
a project.

The folder contains one `.http` file per group of endpoints (a tag in the specification), for example `Banners.http`
and `Content Articles.http`.

### Configure the environment

The requests use two variables: `base_url` and `api_key`. They are set in two environment files in the **phpstorm** folder.

1. Open `http-client.env.json` and change the value of `base_url` to the URL of your Joomla website, for example
   ```https://www.myjoomlawebsite.com/api/index.php```. Keep the ```/api/index.php``` part at the end of the URL, as that
   is the endpoint for Joomla API requests.
2. Copy `http-client.private.env.json.example` to `http-client.private.env.json`.
3. Copy the API token from your Joomla user profile and paste it as the value of `api_key` in
   `http-client.private.env.json`.

The private environment file is listed in `.gitignore`, so your token is not committed by accident.

The requests in `Joomla Update.http` do not use the API token. They use the token of the Joomla Automated Updates
service, which you find in the options of Joomla Update. Set it as the value of `update_token` in
`http-client.private.env.json` if you want to use these requests.

## Using the collection

### Running a GET request

A simple test to see if the API endpoints are working is a ```GET``` on Config Application.

1. Open `Config Application.http`.
2. In the toolbar at the top of the editor, select the **joomla** environment in the **Run with** dropdown.
3. Click the green run icon in the gutter next to **Get Global Configuration**. The URL for this request is ```{{base_url}}/v1/config/application```.
4. If all is working you should see a response with status 200 in the **Services** tool window, with the global
   configuration of your Joomla website in JSON format.

### Using variables in requests

Requests that work on a single item use a variable in the URL, for example ```{{article_id}}```. These variables are
defined at the top of each `.http` file with a default value:

```
@article_id = 1
```

First, retrieve a list of articles.

1. Open `Content Articles.http`.
2. Run the request **List Articles**. The URL for this request is ```{{base_url}}/v1/content/articles```.
3. If your Joomla website has articles, you should see a response with status 200 and a list of articles in JSON format.

Retrieve an article with a specific ID.

1. In the JSON result of the content/articles request, find the ID of an article you want to retrieve. An example ID is shown as ```"id": 11```.
2. Change the variable at the top of `Content Articles.http` to ```@article_id = 11```.
3. Run the request **Get Article**. The URL for this request is ```{{base_url}}/v1/content/articles/{{article_id}}```.

### Query parameters

List requests support paging, and some also support filters. The available query parameters are listed in a comment
above the request. Add them to the URL, for example:

```
# Optional query parameters: page[offset], page[limit], filter[search], filter[state]
GET {{base_url}}/v1/content/articles?filter[search]=joomla&page[limit]=5
```

## Updating the collection

The `.http` files are generated from the specification by
[`scripts/generate-phpstorm.mjs`](../scripts/generate-phpstorm.mjs). Do not change them by hand: change
`src/joomla-ws-api.json` and generate the collection again, in the same pull request.

```bash
npm run phpstorm          # writes the .http files in this folder
npm run phpstorm:check    # fails when the .http files are not up to date with the specification
```

CI runs the check on every pull request.
