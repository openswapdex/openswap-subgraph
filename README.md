## setup

inside the folder

```
npm run setup
```

## deploy
#### Make sure you got all parameters correct before you deploy

All of them can be found in the dashboard and the subgraph
- username
- project name
- access token

```
graph deploy your_username/your_projectname --ipfs https://api.thegraph.com/ipfs/ --node https://api.thegraph.com/deploy/ --debug --access-token your_access-token
```